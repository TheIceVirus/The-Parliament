"""
BRIAR CHRONICLES — archive server.

Zero dependencies: needs only Python 3.9+.
    python server.py                  start the archive (first-run password: sutrah)
    python server.py --set-password   change / reset the artist password

Environment: BRIAR_HOST (default 127.0.0.1), BRIAR_PORT (default 8666).
"""
import base64
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import socket
import struct
import sys
import threading
import time
import uuid
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
DATA = os.environ.get("BRIAR_DATA") or os.path.join(ROOT, "data")
UPLOADS = os.path.join(DATA, "uploads")
SEED = os.path.join(ROOT, "seed")
DB_PATH = os.path.join(DATA, "db.json")
AUTH_PATH = os.path.join(DATA, "auth.json")
SESS_PATH = os.path.join(DATA, "sessions.json")

HOST = os.environ.get("BRIAR_HOST", "127.0.0.1")
PORT = int(os.environ.get("BRIAR_PORT") or os.environ.get("PORT") or "8666")
MAX_BODY = 70 * 1024 * 1024          # 70 MB request (base64 image + thumb)
SESSION_TTL = 14 * 24 * 3600         # two weeks
COOKIE = "briar_session"
DEFAULT_PASSWORD = "sutrah"           # the keeper's word on first run; change it any time in Settings
MIN_PW = 6
VERSION = "4"                         # shown on the site footer and in the dashboard
DESIGNER_START = {"salt": "12WqYWdHAZGrOwNksbtaEA==", "hash": "HzVL58gA/EE6a0kcHHyF/TVnb4N3uQhtjE5wji2D1fk="}

LOCK = threading.RLock()
FAILS = {}                            # ip -> [timestamps]
POSTS = {}                            # ip -> [timestamps] of comments, for the comment limit
COMMENT_NAME, COMMENT_TEXT = 40, 1000
COMMENTS_PER_IP = 5                   # per 10 minutes
COMMENTS_SITEWIDE = 40                # per 10 minutes, from everyone together
COMMENTS_PER_ART = 300

MIME = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".ico": "image/x-icon", ".woff2": "font/woff2",
}

CSP = ("default-src 'self'; img-src 'self' data: blob:; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; "
       "frame-ancestors 'self'; base-uri 'self'; form-action 'self'")

DISPLAY_DEFAULTS = {
    "fit": "contain", "position": "center", "size": "standard",
    "background": "void", "border": "silver", "animation": "fade", "mat": "none", "caption": "hover",
}
DISPLAY_CHOICES = {
    "fit": {"contain", "cover"},
    "position": {"center", "top", "bottom", "left", "right"},
    "size": {"standard", "wide", "tall", "large"},
    "background": {"void", "stone", "crimson", "ivory", "moonlit", "stained"},
    "border": {"none", "thin", "silver", "gothic", "crimson", "gilded", "arch", "briar", "reliquary", "stained", "candle", "iron"},
    "animation": {"fade", "rise", "glow", "ember", "none"},
    "mat": {"none", "small", "large"},
    "caption": {"hover", "always", "hidden"},
}
GALLERY_LAYOUTS = ("masonry", "grid", "immersive")

KEEPER_SETTINGS = {"about", "artistName", "links", "portraitCaption", "portraitLink", "portraitUpload", "featuredId", "categories", "commentsOn",
                   "siteTitle", "tagline", "defaultLayout", "galleryColumns", "gallerySpacing", "defaultFrame"}
KEEPER_INTRO = {"inscription", "button", "hint", "beginText"}

# The designer's controls. Every value is validated against these lists.
FONTS = {
    "title": ["Cinzel Decorative", "UnifrakturMaguntia", "Grenze Gotisch", "Pirata One", "Cormorant SC", "Cinzel", "Playfair Display SC", "IM Fell English SC"],
    "head": ["Cinzel", "Cormorant SC", "Marcellus SC", "Playfair Display SC", "IM Fell English SC"],
    "body": ["Cormorant Garamond", "EB Garamond", "Crimson Pro", "Spectral", "Lora", "IM Fell English"],
}
LOOK_DEFAULTS = {
    "colors": {"crimson": "#b3202f", "crimsonHot": "#e0384a", "blood": "#7e0d1d", "burgundy": "#3f0c16",
               "ivory": "#ebe3d1", "silver": "#bdb8c2", "black": "#07060a", "gold": "#d8b878", "moon": "#c3192c"},
    "glass": ["#d81f35", "#9c1024", "#5a0716", "#1f4fd1", "#6b2bb8", "#e8a23a"],
    "fonts": {"title": "Cinzel Decorative", "head": "Cinzel", "body": "Cormorant Garamond"},
    "intro": {"enabled": True, "soundChoice": True, "inscription": "ARCHIVVM · RERVM · QVAE · NON · DEBENT · ESSE",
              "button": "Enter the Archive", "hint": "", "beginText": "Welcome to the archive."},
    "effects": {"embers": 50, "fog": True, "watcher": True, "moon": True, "rays": True, "candles": True, "parallax": True, "sparkles": True},
    "nav": {"archive": "The Archive", "collections": "The Collections", "journal": "The Journal",
            "relics": "The Relics", "beyond": "Beyond the Cathedral"},
    "customCSS": "",
}


def clean_look(d):
    d = d if isinstance(d, dict) else {}
    hexok = lambda v: isinstance(v, str) and re.match(r"^#[0-9a-fA-F]{6}$", v)
    out = {}
    c = d.get("colors") or {}
    out["colors"] = {k: (c.get(k) if hexok(c.get(k)) else v) for k, v in LOOK_DEFAULTS["colors"].items()}
    g = d.get("glass")
    out["glass"] = [x for x in g if hexok(x)][:8] if isinstance(g, list) and any(hexok(x) for x in g) else list(LOOK_DEFAULTS["glass"])
    while len(out["glass"]) < 6:
        out["glass"].append(LOOK_DEFAULTS["glass"][len(out["glass"])])
    f = d.get("fonts") or {}
    out["fonts"] = {k: (f.get(k) if f.get(k) in FONTS[k] else v) for k, v in LOOK_DEFAULTS["fonts"].items()}
    i = d.get("intro") or {}
    out["intro"] = {}
    for k, v in LOOK_DEFAULTS["intro"].items():
        out["intro"][k] = bool(i.get(k, v)) if isinstance(v, bool) else s(i.get(k, v), 200)
    e = d.get("effects") or {}
    out["effects"] = {}
    for k, v in LOOK_DEFAULTS["effects"].items():
        if isinstance(v, bool):
            out["effects"][k] = bool(e.get(k, v))
        else:
            try:
                out["effects"][k] = max(0, min(100, int(e.get(k, v))))
            except (TypeError, ValueError):
                out["effects"][k] = v
    n = d.get("nav") or {}
    out["nav"] = {k: s(n.get(k), 40) or v for k, v in LOOK_DEFAULTS["nav"].items()}
    out["customCSS"] = str(d.get("customCSS") or "")[:30000].replace("</", "<\\/")
    return out


# ───────────────────────────── storage ─────────────────────────────
def now():
    return int(time.time())


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def load_db():
    return read_json(DB_PATH, None)


def save_db(db):
    write_json(DB_PATH, db)


def new_id():
    return uuid.uuid4().hex[:12]


def image_size(data):
    """Return (w, h) for png/jpeg/webp/gif bytes, or (0, 0)."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">II", data[16:24])
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return struct.unpack("<HH", data[6:10])
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            c = data[12:16]
            if c == b"VP8X":
                return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
            if c == b"VP8 ":
                w, h = struct.unpack("<HH", data[26:30])
                return w & 0x3FFF, h & 0x3FFF
            b = int.from_bytes(data[21:25], "little")
            return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data):
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                seg = struct.unpack(">H", data[i + 2:i + 4])[0]
                i += 2 + seg
    except Exception:
        pass
    return 0, 0


def sniff_ext(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:2] == b"\xff\xd8":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    return None


def store_data_url(data_url, stem):
    """Decode a data: URL, verify it is a real image, save it. Returns (url, w, h)."""
    m = re.match(r"^data:image/[a-z+.-]+;base64,(.+)$", data_url or "", re.S)
    if not m:
        raise ValueError("Image must be a PNG, JPEG, WebP or GIF.")
    raw = base64.b64decode(m.group(1), validate=False)
    ext = sniff_ext(raw)
    if not ext:
        raise ValueError("That file is not a supported image.")
    name = f"{stem}{ext}"
    with open(os.path.join(UPLOADS, name), "wb") as f:
        f.write(raw)
    w, h = image_size(raw)
    return f"/uploads/{name}", w, h


def remove_upload(url):
    if url and url.startswith("/uploads/"):
        p = os.path.join(UPLOADS, os.path.basename(url))
        if os.path.isfile(p):
            os.remove(p)


# ───────────────────────────── sanitizing ─────────────────────────────
def s(v, limit=200):
    return str(v or "").strip()[:limit]


def clean_url(u):
    u = s(u, 600)
    if not u:
        return ""
    if not re.match(r"^(https?://|mailto:)", u, re.I):
        if re.match(r"^[a-z][a-z0-9+.-]*:", u, re.I) and not re.match(r"^[^:/]+:\d+", u):
            return ""                      # javascript:, data:, etc.
        u = "https://" + u
    return u if re.match(r"^(https?://[^\s<>\"']+|mailto:[^\s<>\"']+)$", u, re.I) else ""


def clean_links(links):
    out = []
    for l in (links or [])[:20]:
        if isinstance(l, dict):
            url = clean_url(l.get("url"))
            if url:
                out.append({"label": s(l.get("label"), 80) or url, "url": url})
    return out


def clean_list(v, limit=40, each=60):
    if isinstance(v, str):
        v = v.split(",")
    seen, out = set(), []
    for t in (v or [])[:limit]:
        t = s(t, each)
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out


def clean_display(d):
    d = d if isinstance(d, dict) else {}
    return {k: (d.get(k) if d.get(k) in DISPLAY_CHOICES[k] else v) for k, v in DISPLAY_DEFAULTS.items()}


def apply_art_meta(art, m, db):
    art["title"] = s(m.get("title"), 140) or "Untitled Relic"
    art["description"] = s(m.get("description"), 8000)
    art["tags"] = clean_list(m.get("tags"))
    art["category"] = s(m.get("category"), 60)
    art["links"] = clean_links(m.get("links"))
    art["year"] = s(m.get("year"), 20)
    art["featured"] = bool(m.get("featured"))
    art["published"] = bool(m.get("published", True))
    art["alt"] = s(m.get("alt"), 400)
    art["display"] = clean_display(m.get("display"))
    valid = {c["id"] for c in db["collections"]}
    wanted = [c for c in (m.get("collections") or []) if c in valid]
    for c in db["collections"]:
        ids = [i for i in c["artworks"] if i != art["id"]]
        if c["id"] in wanted:
            ids.append(art["id"])
        c["artworks"] = ids


# ───────────────────────────── auth ─────────────────────────────
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return base64.b64encode(salt).decode(), base64.b64encode(h).decode()


ROLES = ("designer", "keeper")   # designer: everything incl. the look · keeper: the artist's art & profile


def load_auth():
    a = read_json(AUTH_PATH, {}) or {}
    if "hash" in a:                      # older single-password file → that was the keeper's
        a = {"keeper": {"salt": a["salt"], "hash": a["hash"]}}
    return a


def check_pw(pw, role=None):
    """Return the role this password opens, or None."""
    a = load_auth()
    for r in ([role] if role else ROLES):
        rec = a.get(r)
        if rec:
            _, h = hash_pw(pw, base64.b64decode(rec["salt"]))
            if hmac.compare_digest(h, rec["hash"]):
                return r
    return None


def set_pw(pw, role="keeper"):
    a = load_auth()
    salt, h = hash_pw(pw)
    a[role] = {"salt": salt, "hash": h, "set": now()}
    write_json(AUTH_PATH, a)
    with LOCK:                           # sign that role out everywhere
        ss = read_json(SESS_PATH, {})
        write_json(SESS_PATH, {k: v for k, v in ss.items() if isinstance(v, dict) and v.get("role") != role})


def tok_hash(t):
    return hashlib.sha256(t.encode()).hexdigest()


def new_session(role):
    t = secrets.token_urlsafe(32)
    with LOCK:
        ss = {k: v for k, v in read_json(SESS_PATH, {}).items() if isinstance(v, dict) and v["exp"] > now()}
        ss[tok_hash(t)] = {"exp": now() + SESSION_TTL, "role": role}
        write_json(SESS_PATH, ss)
    return t


def session_role(t):
    if not t:
        return None
    v = read_json(SESS_PATH, {}).get(tok_hash(t))
    return v["role"] if isinstance(v, dict) and v["exp"] > now() else None


def end_session(t):
    if not t:
        return
    with LOCK:
        ss = read_json(SESS_PATH, {})
        ss.pop(tok_hash(t), None)
        write_json(SESS_PATH, ss)


def rate_limited(ip):
    win = [t for t in FAILS.get(ip, []) if t > now() - 600]
    FAILS[ip] = win
    return len(win) >= 6


def comment_limited(ip):
    cut = now() - 600
    for k in list(POSTS):
        POSTS[k] = [t for t in POSTS[k] if t > cut]
        if not POSTS[k]:
            del POSTS[k]
    total = sum(len(v) for v in POSTS.values())
    return len(POSTS.get(ip, [])) >= COMMENTS_PER_IP or total >= COMMENTS_SITEWIDE


def comment_text(v, limit):
    """Plain text only. Collapse long runs of blank lines and strip control characters."""
    t = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", str(v or "")).strip()
    return re.sub(r"\n{3,}", "\n\n", t)[:limit]


def public_comment(c):
    return {k: c[k] for k in ("id", "name", "text", "created")}


# ───────────────────────────── seed ─────────────────────────────
D = dict  # display shorthand
X = "https://x.com/TheIceVirus/status/"
SEED_ART = [
    dict(key="jester", file="the-weeping-jester.webp", title="The Weeping Jester", category="Character Art", featured=True,
         description="A sad jester on a stool, crying and holding a wilting rose.",
         tags=["jester", "harlequin", "melancholy", "rose", "original"],
         display=D(fit="contain", size="tall", background="stained", border="gothic", animation="glow"),
         alt="A jester in a blue and black harlequin hat sits slumped on a wooden stool, one tear falling, holding a drooping red rose beneath a glowing blue diamond.",
         links=[]),
    dict(key="devotion", file="icevirus-banner.jpeg", title="Devotion", category="Illustration", featured=False,
         description="Two characters sharing a kiss, surrounded by little red hearts.",
         tags=["couple", "hearts", "embrace"],
         display=D(fit="contain", size="wide", background="ivory", border="crimson", animation="fade"),
         alt="A dark-skinned woman in an orange beret embraces and kisses a blonde armored woman, surrounded by floating red hearts.",
         links=[]),
    dict(key="king", file="the-king-in-yellow.jpg", title="The King in Yellow", category="Original Characters", featured=True, year="2026",
         description="Sutrah, the King in Yellow. One of his own characters.",
         tags=["king in yellow", "sutrah", "original", "yellow", "horror"],
         display=D(fit="cover", position="top", size="tall", background="void", border="gilded", animation="glow"),
         alt="A dark-skinned figure with wild pale-blonde hair, a yellow suit and black tie grins widely beneath a scribbled golden crown, half in a spotlight against black.",
         links=[{"label": "Original post on X", "url": X + "2087613364130504891"}]),
    dict(key="storm", file="now-the-thunder-is-coming.jpg", title="Now the Thunder Is Coming", category="Fan Art", featured=True, year="2026",
         description="His own design for Storm from the X-Men.",
         tags=["storm", "x-men", "marvel", "rain"],
         display=D(fit="cover", position="top", size="tall", background="stone", border="silver", animation="ember"),
         alt="Storm with huge white hair and glowing white eyes, in a black suit with a silver sash, standing in grey rain.",
         links=[{"label": "Original post on X", "url": X + "2054607594015293693"}]),
    dict(key="scarlet", file="scarlet-witch.jpg", title="Scarlet Witch", category="Fan Art", featured=False, year="2026",
         description="Scarlet Witch fan art.",
         tags=["scarlet witch", "marvel", "red"],
         display=D(fit="cover", position="top", size="standard", background="crimson", border="crimson", animation="rise"),
         alt="Scarlet Witch with long dark red hair and glowing red eyes in a black crop top, fists raised against a red background.",
         links=[{"label": "Original post on X", "url": X + "2057211167568007422"}]),
    dict(key="magik", file="magik.jpg", title="Magik", category="Fan Art", featured=True, year="2026",
         description="His design for Magik, the character he draws the most.",
         tags=["magik", "x-men", "marvel", "limbo"],
         display=D(fit="cover", position="top", size="large", background="moonlit", border="gothic", animation="glow"),
         alt="Magik with long blonde hair and horned bangs in a black and yellow X-Men suit, armored spiked gauntlet on one arm, against a yellow splash.",
         links=[{"label": "Original post on X", "url": X + "2073162590814097571"}]),
    dict(key="magik-ukiyo", file="magik-ukiyo.jpg", title="Magik, Under a Red Sun", category="Fan Art", featured=False, year="2026",
         description="He was practicing a Japanese-inspired style and it turned into a Magik piece.",
         tags=["magik", "marvel", "ukiyo-e", "sword"],
         display=D(fit="cover", position="center", size="standard", background="ivory", border="thin", animation="rise"),
         alt="Magik in a yellow and black kimono-style outfit swinging a glowing sword before a large red sun and swirling gold clouds.",
         links=[{"label": "Original post on X", "url": X + "2044198097526632918"}]),
    dict(key="polaris", file="polaris.jpg", title="Polaris", category="Fan Art", featured=False, year="2026",
         description="Polaris fan art.",
         tags=["polaris", "x-men", "marvel", "green"],
         display=D(fit="cover", position="top", size="standard", background="void", border="silver", animation="fade"),
         alt="Polaris with long green hair and green lipstick, in a green jacket with an X emblem, crouched against a green panel.",
         links=[{"label": "Original post on X", "url": X + "2059947288571658636"}]),
    dict(key="sue", file="sue-storm.jpg", title="Sue Storm", category="Fan Art", featured=False, year="2026",
         description="Sue Storm, the Invisible Woman.",
         tags=["invisible woman", "fantastic four", "marvel", "blue"],
         display=D(fit="cover", position="top", size="standard", background="moonlit", border="thin", animation="rise"),
         alt="Sue Storm with blonde hair in a blue Fantastic Four suit, holding two translucent force-field spheres against a blue background.",
         links=[{"label": "Original post on X", "url": X + "2062263840201658727"}]),
    dict(key="isabale", file="isabale.jpg", title="Isabale", category="Original Characters", featured=False, year="2026",
         description="Isabale, one of his original characters.",
         tags=["original", "oc", "witch", "character sheet"],
         display=D(fit="contain", position="center", size="wide", background="ivory", border="thin", animation="fade"),
         alt="A character sheet of a blonde woman in a black witch hat with an orange band and dark overalls, shown in four poses with apples and dark tendrils.",
         links=[{"label": "Original post on X", "url": X + "2084687648418066740"}]),
    dict(key="taliyah", file="taliyah.jpg", title="Taliyah (Ra)", category="Original Characters", featured=False, year="2026",
         description="Taliyah, also called Ra. One of his original characters, drawn again after a long break.",
         tags=["original", "oc", "taliyah", "ra"],
         display=D(fit="cover", position="top", size="standard", background="crimson", border="gilded", animation="rise"),
         alt="A dark-skinned woman with black and white hair in a bun, wearing a red top and black pants, kneeling against a bright yellow background.",
         links=[{"label": "Original post on X", "url": X + "2063667465033584896"}]),
]
SEED_V1 = {"jester", "devotion"}       # what the very first build shipped with
SEED_COLLECTIONS = [
    dict(key="sorrows", name="Court of Sorrows", description="The darker pieces.", art=["jester", "king"]),
    dict(key="tender", name="Tender Things", description="The softer pieces.", art=["devotion"]),
    dict(key="heroines", name="Heroines of the Storm", description="Marvel fan art, mostly Magik.",
         art=["magik", "storm", "scarlet", "magik-ukiyo", "polaris", "sue"]),
    dict(key="originals", name="Original Souls", description="His original characters.", art=["king", "isabale", "taliyah"]),
]
ABOUT_V1 = ("Artist and streamer. Paints the faces that linger after the candles go out — "
            "and streams Deadlock, Dragon's Dogma II and art on Twitch.")
ABOUT = "Vi, also known as TheIceVirus. Artist and streamer. Draws a lot of Marvel characters (mostly Magik) and original characters like Isabale, Taliyah and Sutrah, the King in Yellow. Streams Deadlock, Dragon's Dogma II and art on Twitch.\n\nCommissions are open."
LINKS = [
    {"label": "Twitch", "url": "https://www.twitch.tv/theicevirus"},
    {"label": "X", "url": "https://x.com/TheIceVirus"},
    {"label": "Patreon", "url": "https://www.patreon.com/cw/TheIceVirus"},
    {"label": "Bluesky", "url": "https://bsky.app/profile/theicevirus.bsky.social"},
    {"label": "DeviantArt", "url": "https://www.deviantart.com/the-ice-virus"},
    {"label": "TikTok", "url": "https://www.tiktok.com/@sutrah_thekinginyellow"},
    {"label": "Commissions & everything else", "url": "https://linktr.ee/TheIceVirus"},
]


# Wording from earlier builds. If an archive still has it untouched, it is swapped for the current text.
OLD_COPY = {
 "desc": {
  "jester": [
   "A fool with no audience left. The bells still ring when no one is laughing — a single tear, a broken heart stitched over the ribs, and a rose let go of mid-thought, its petals falling toward the floor of the cathedral."
  ],
  "devotion": [
   "Two souls, one embrace, a sky full of small red hearts. Even an archive of sorrow keeps a few tender things."
  ],
  "king": [
   "Sutrah, the King in Yellow — a crown of gold scratches floating over a head of pale hair, a yellow suit, and a grin with far too many teeth. Lit by a single beam in the dark, as royalty should be."
  ],
  "storm": [
   "“Now the thunder is coming.” His own design for Storm — white hair whipping in the rain, eyes already burning white."
  ],
  "scarlet": [
   "Wanda against a wall of red, hex-light gathering at her fists."
  ],
  "magik": [
   "His design of Magik — Illyana Rasputina, Limbo's sorceress queen, Soulsword at her side and the demon-gauntlet raised. The character he keeps coming back to."
  ],
  "magik-ukiyo": [
   "An experiment in Japanese-inspired style that turned, as things tend to, into Magik — Soulsword raised, red sun behind her."
  ],
  "polaris": [
   "Lorna Dane in X-Factor green, magnetic and unbothered."
  ],
  "sue": [
   "The Invisible Woman, force fields up."
  ],
  "isabale": [
   "An original character — a witch's hat, a basket of apples, and a few too many shadowy tendrils for comfort."
  ],
  "taliyah": [
   "A character of his own, returning after a long time away — Taliyah, or Ra, for those who remember."
  ]
 },
 "col": {
  "sorrows": [
   "Fools, kings and sinners who outlived their audience."
  ],
  "tender": [
   "Even an archive of sorrow keeps a few warm hearts."
  ],
  "heroines": [
   "Mutants, witches and sorceresses, drawn his way — Magik above all."
  ],
  "originals": [
   "Characters who exist nowhere else."
  ]
 },
 "about": [
  "Artist and streamer. Paints the faces that linger after the candles go out — and streams Deadlock, Dragon's Dogma II and art on Twitch.",
  "Vi — artist, streamer, currently residing in Limbo. Draws heroines with more muscle than mercy: Magik above all, alongside Storm, Scarlet Witch, She-Hulk, and original souls like Isabale, Taliyah and Sutrah, the King in Yellow. Streams Deadlock, Dragon's Dogma II and art on Twitch.\n\nCommissions are open."
 ],
 "caption": [
  "My Twitch profile picture — come say hi on stream"
 ],
 "begin": [
  "The doors are closed. Something is singing behind them."
 ],
 "journal": "The First Candle"
}


def fix_first_build(db):
    """The very first build showed his Twitch picture as an artwork. Turn it back into his profile picture."""
    halo = next((a for a in db["artworks"] if a.get("title") == "Haloed Grin"
                 and a.get("description", "").startswith("Something wearing a halo")), None)
    if not halo:
        return False
    st = db["settings"]
    if not st.get("portraitImage"):
        st["portraitImage"] = halo["image"]
        st.setdefault("portraitCaption", "My Twitch profile picture. Come say hi on stream.")
        st.setdefault("portraitLink", "https://www.twitch.tv/theicevirus")
    elif halo["image"] != st["portraitImage"]:
        remove_upload(halo["image"])
    if halo.get("thumb") not in (halo["image"], st.get("portraitImage")):
        remove_upload(halo["thumb"])
    db["artworks"] = [a for a in db["artworks"] if a["id"] != halo["id"]]
    for c in db["collections"]:
        c["artworks"] = [i for i in c["artworks"] if i != halo["id"]]
        if c.get("cover") == halo["id"]:
            c["cover"] = c["artworks"][0] if c["artworks"] else ""
    # that build's "Faces Behind the Glass" only existed to hold the picture
    db["collections"] = [c for c in db["collections"]
                         if not (c["name"] == "Faces Behind the Glass" and c.get("description", "").startswith("Portraits recovered"))]
    for k in ("featuredId", "portraitId"):
        if st.get(k) == halo["id"]:
            st[k] = ""
    st.pop("portraitId", None)
    return True


def refresh_copy(db):
    if db.get("copyRev", 0) >= 2:
        return False
    new_desc = {a["key"]: a["description"] for a in SEED_ART}
    new_col = {c["key"]: c["description"] for c in SEED_COLLECTIONS}
    for a in db["artworks"]:
        k = a.get("seedKey")
        if k in new_desc and a.get("description") in OLD_COPY["desc"].get(k, []):
            a["description"] = new_desc[k]
    for c in db["collections"]:
        k = c.get("seedKey")
        if k in new_col and c.get("description") in OLD_COPY["col"].get(k, []):
            c["description"] = new_col[k]
    st = db["settings"]
    if st.get("about") in OLD_COPY["about"]:
        st["about"] = ABOUT
    if st.get("portraitCaption") in OLD_COPY["caption"]:
        st["portraitCaption"] = "My Twitch profile picture. Come say hi on stream."
    db["journal"] = [j for j in db["journal"] if not (j.get("title") == OLD_COPY["journal"] and "The doors of the archive are open." in j.get("body", ""))]
    look = db.get("look")
    if isinstance(look, dict) and isinstance(look.get("intro"), dict) and look["intro"].get("beginText") in OLD_COPY["begin"]:
        look["intro"]["beginText"] = "Welcome to the archive."
    db["copyRev"] = 2
    return True


def ensure_seeds(db):
    """Add any shipped artwork this archive has never had. Pieces the artist deleted stay deleted."""
    if "seeded" not in db:
        db["seeded"] = sorted(SEED_V1) if db.get("artworks") else []
    seeded, changed = set(db["seeded"]), False
    by_key = {a.get("seedKey"): a["id"] for a in db["artworks"] if a.get("seedKey")}
    if "jester" in seeded and "jester" not in by_key:       # first-build pieces predate seed keys
        for a in db["artworks"]:
            k = {"The Weeping Jester": "jester", "Devotion": "devotion"}.get(a["title"])
            if k and k not in by_key:
                a["seedKey"] = k; by_key[k] = a["id"]
    os.makedirs(UPLOADS, exist_ok=True)
    for i, a in enumerate(SEED_ART):
        if a["key"] in seeded:
            continue
        src = os.path.join(SEED, a["file"])
        if not os.path.isfile(src):
            continue
        aid = new_id()
        ext = os.path.splitext(a["file"])[1]
        shutil.copyfile(src, os.path.join(UPLOADS, aid + ext))
        with open(src, "rb") as f:
            w, h = image_size(f.read())
        db["artworks"].append({
            "id": aid, "seedKey": a["key"], "title": a["title"], "description": a["description"], "tags": a["tags"],
            "category": a["category"], "links": a["links"], "year": a.get("year", ""), "featured": a["featured"],
            "published": True, "alt": a["alt"], "display": clean_display(a["display"]),
            "image": f"/uploads/{aid}{ext}", "thumb": f"/uploads/{aid}{ext}",
            "width": w, "height": h, "created": now() - (100 - i), "updated": now(),
        })
        by_key[a["key"]] = aid
        seeded.add(a["key"]); changed = True
    if changed:
        order = {a["key"]: n for n, a in enumerate(SEED_ART)}       # shipped pieces in curated order, his uploads first
        db["artworks"].sort(key=lambda x: (0, 0) if not x.get("seedKey") else (1, order.get(x["seedKey"], 99)))
        have = {c.get("seedKey") or c["name"]: c for c in db["collections"]}
        for sc in SEED_COLLECTIONS:
            col = have.get(sc["key"]) or have.get(sc["name"])
            ids = [by_key[k] for k in sc["art"] if k in by_key]
            if col is None and ids:
                db["collections"].append({"id": new_id(), "seedKey": sc["key"], "name": sc["name"], "description": sc["description"],
                                          "artworks": ids, "cover": ids[0], "created": now()})
            elif col is not None:
                col["seedKey"] = sc["key"]
                col["artworks"] += [i for i in ids if i not in col["artworks"]]
        st = db["settings"]
        if st.get("about") == ABOUT_V1:
            st["about"] = ABOUT
        old_urls = {l["url"] for l in st.get("links", [])}
        if old_urls <= {l["url"] for l in LINKS[:2]}:              # untouched first-build links → the full set
            st["links"] = [dict(l) for l in LINKS]
        if "king" in by_key and not st.get("featuredId"):
            st["featuredId"] = by_key["king"]
        db["seeded"] = sorted(seeded)
    return changed


def seed_db():
    os.makedirs(UPLOADS, exist_ok=True)
    db = {"version": 2, "copyRev": 2, "artworks": [], "collections": [], "journal": [], "seeded": [],
          "settings": {
              "siteTitle": "BRIAR CHRONICLES",
              "tagline": "Some things were never meant to be remembered.",
              "artistName": "TheIceVirus",
              "about": ABOUT,
              "featuredId": "",
              "defaultLayout": "masonry",
              # The Twitch profile picture: shown as his identity, never as an archive piece.
              "portraitImage": "",
              "portraitCaption": "My Twitch profile picture. Come say hi on stream.",
              "portraitLink": "https://www.twitch.tv/theicevirus",
              "links": [dict(l) for l in LINKS],
              "categories": ["Original Characters", "Fan Art", "Character Art", "Illustration", "Sketches"],
          }}
    ensure_seeds(db)
    by_key = {a["seedKey"]: a["id"] for a in db["artworks"]}
    db["settings"]["featuredId"] = by_key.get("king") or by_key.get("jester", "")
    avatar = os.path.join(SEED, "icevirus-avatar.png")
    if os.path.isfile(avatar):
        shutil.copyfile(avatar, os.path.join(UPLOADS, "portrait.png"))
        db["settings"]["portraitImage"] = "/uploads/portrait.png"
    save_db(db)
    return db


# ───────────────────────────── HTTP ─────────────────────────────
class Handler(BaseHTTPRequestHandler):
    server_version = "BriarArchive/1.0"
    sys_version = ""

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("  %s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # helpers
    def ip(self):
        return self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()

    def token(self):
        c = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        return c[COOKIE].value if COOKIE in c else None

    def role(self):
        if not hasattr(self, "_role"):
            self._role = session_role(self.token())
        return self._role

    def is_admin(self):
        return self.role() is not None

    def common_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")   # the designer's live preview frames the site
        self.send_header("Content-Security-Policy", CSP)

    def send_json(self, obj, code=200, extra=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or []):
            self.send_header(k, v)
        self.common_headers()
        self.end_headers()
        self.wfile.write(body)

    def err(self, msg, code=400):
        self.send_json({"error": msg}, code)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("That upload is too large (limit about 50 MB).")
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw or b"{}")

    def cookie_header(self, value, max_age):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return ("Set-Cookie", f"{COOKIE}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}")

    def serve_file(self, path, cache="no-cache"):
        if not os.path.isfile(path):
            return self.err("Not found", 404)
        ext = os.path.splitext(path)[1].lower()
        with open(path, "rb") as f:
            data = f.read()
        if ext == ".html":
            data = re.sub(rb'((?:href|src)="/(?:css|js|img)/[^"?#]+)"', rb'\1?v=' + VERSION.encode() + b'"', data)
        elif ext == ".js" and path.startswith(PUBLIC):
            data = re.sub(rb'(from "\./[\w-]+\.js)"', rb'\1?v=' + VERSION.encode() + b'"', data)
            data = re.sub(rb'(import\("/js/[\w-]+\.js)"', rb'\1?v=' + VERSION.encode() + b'"', data)
        etag = '"%s"' % hashlib.md5(data).hexdigest()[:16]
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("ETag", etag)
        self.common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def safe_join(self, base, rel):
        p = os.path.normpath(os.path.join(base, unquote(rel).lstrip("/\\")))
        return p if p.startswith(os.path.normpath(base) + os.sep) else None

    # routing
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        if p.startswith("/api/"):
            return self.api("GET", p, parse_qs(u.query))
        if p.startswith("/uploads/"):
            f = self.safe_join(UPLOADS, p[len("/uploads/"):])
            return self.serve_file(f, "public, max-age=31536000, immutable") if f else self.err("Not found", 404)
        if p in ("/", "/index.html"):
            return self.serve_file(os.path.join(PUBLIC, "index.html"), "no-store")
        if p in ("/admin", "/admin/", "/admin.html"):
            return self.serve_file(os.path.join(PUBLIC, "admin.html"), "no-store")
        f = self.safe_join(PUBLIC, p)
        return self.serve_file(f) if f else self.err("Not found", 404)

    def do_POST(self):
        self.mutate("POST")

    def do_PUT(self):
        self.mutate("PUT")

    def do_DELETE(self):
        self.mutate("DELETE")

    def mutate(self, method):
        p = urlparse(self.path).path
        if not p.startswith("/api/"):
            return self.err("Not found", 404)
        # CSRF guard: browsers cannot send this header cross-site without a CORS preflight we never allow.
        if self.headers.get("X-Briar") != "1":
            return self.err("Forbidden", 403)
        self.api(method, p, {})

    def api(self, method, p, q):
        try:
            return self.route(method, p, q)
        except ValueError as e:
            return self.err(str(e))
        except Exception as e:  # keep server alive, surface the problem
            sys.stderr.write(f"  ! {type(e).__name__}: {e}\n")
            return self.err("Something went wrong in the archive.", 500)

    def route(self, method, p, q):
        parts = [x for x in p.split("/") if x][1:]   # drop 'api'
        head = parts[0] if parts else ""

        # ── public ──
        if method == "GET" and head == "public":
            db = load_db()
            drafts = q.get("preview") == ["1"] and self.is_admin()
            arts = [a for a in db["artworks"] if a["published"] or drafts]
            ids = {a["id"] for a in arts}
            cols = [dict(c, artworks=[i for i in c["artworks"] if i in ids]) for c in db["collections"]]
            journal = [j for j in db["journal"] if j["published"] or drafts]
            journal.sort(key=lambda j: j.get("date", ""), reverse=True)
            st = {k: v for k, v in db["settings"].items()}
            st["commentsOn"] = st.get("commentsOn", True)
            counts = {}
            for c in db.get("comments", []):
                if c["art"] in ids:
                    counts[c["art"]] = counts.get(c["art"], 0) + 1
            return self.send_json({"settings": st, "look": clean_look(db.get("look")), "artworks": arts,
                                   "collections": cols, "journal": journal, "preview": bool(drafts), "version": VERSION,
                                   "commentCounts": counts})

        # ── comments: anyone can read and leave one; only the keeper or designer can remove them ──
        if head == "comments" and method in ("GET", "POST") and len(parts) == 2:
            with LOCK:
                db = load_db()
                art = next((a for a in db["artworks"] if a["id"] == parts[1] and (a["published"] or self.is_admin())), None)
                if not art:
                    return self.err("That artwork is not in the archive.", 404)
                is_on = db["settings"].get("commentsOn", True)
                mine = [c for c in db.get("comments", []) if c["art"] == art["id"]]
                if method == "GET":
                    return self.send_json({"open": is_on, "comments": [public_comment(c) for c in mine]})
                if not is_on:
                    return self.err("Comments are closed.", 403)
                b = self.body()
                if s(b.get("website")):                   # a hidden field only bots fill in
                    return self.send_json({"ok": True, "comments": [public_comment(c) for c in mine]})
                text = comment_text(b.get("text"), COMMENT_TEXT)
                if not text:
                    return self.err("Write a comment first.")
                if len(mine) >= COMMENTS_PER_ART:
                    return self.err("This piece has too many comments to take more.", 403)
                ip = self.ip()
                if comment_limited(ip):
                    return self.err("Too many comments right now. Try again in a few minutes.", 429)
                POSTS.setdefault(ip, []).append(now())
                c = {"id": new_id(), "art": art["id"], "name": comment_text(b.get("name"), COMMENT_NAME).replace("\n", " ") or "Anonymous",
                     "text": text, "created": now()}
                db.setdefault("comments", []).append(c)
                save_db(db)
                mine.append(c)
                return self.send_json({"ok": True, "comments": [public_comment(x) for x in mine]})

        if head == "me" and method == "GET":
            return self.send_json({"admin": self.is_admin(), "role": self.role(), "version": VERSION})

        if head == "version" and method == "GET":
            return self.send_json({"version": VERSION, "app": "briar"})

        if head == "login" and method == "POST":
            ip = self.ip()
            if rate_limited(ip):
                return self.err("Too many attempts. The doors stay sealed for ten minutes.", 429)
            pw = s(self.body().get("password"), 500)
            role = check_pw(pw)
            if not role:
                FAILS.setdefault(ip, []).append(now())
                time.sleep(0.6)
                return self.err("The archive does not recognise that phrase.", 401)
            FAILS.pop(ip, None)
            return self.send_json({"ok": True, "role": role}, extra=[self.cookie_header(new_session(role), SESSION_TTL)])

        if head == "logout" and method == "POST":
            end_session(self.token())
            return self.send_json({"ok": True}, extra=[self.cookie_header("", 0)])

        # ── everything below is the artist's alone ──
        if not self.is_admin():
            return self.err("Sealed. Please sign in.", 401)

        with LOCK:
            db = load_db()
            role = self.role()
            designer = role == "designer"
            if head == "admin" and method == "GET":
                return self.send_json(dict(db, look=clean_look(db.get("look")), role=role))

            if head == "password" and method == "POST":
                b = self.body()
                if not check_pw(s(b.get("current"), 500), role):
                    return self.err("Your current password is incorrect.", 401)
                target = b.get("who") if designer and b.get("who") in ROLES else role
                new = s(b.get("new"), 500)
                if len(new) < MIN_PW:
                    return self.err(f"Choose at least {MIN_PW} characters.")
                set_pw(new, target)
                extra = [self.cookie_header(new_session(role), SESSION_TTL)] if target == role else None
                return self.send_json({"ok": True}, extra=extra)

            if head == "look" and method == "PUT":
                b = self.body()
                if not isinstance(b, dict):
                    return self.err("Bad look.")
                if not designer:      # the keeper may change fonts and words, nothing else
                    intro = b.get("intro") if isinstance(b.get("intro"), dict) else {}
                    b = {k: v for k, v in b.items() if k in ("fonts", "nav")}
                    b["intro"] = {k: v for k, v in intro.items() if k in KEEPER_INTRO}
                    if not any(b.values()):
                        return self.err("Only the designer can change that.", 403)
                cur = clean_look(db.get("look"))
                for k, v in b.items():           # partial updates merge into the current look
                    if isinstance(v, dict) and isinstance(cur.get(k), dict):
                        cur[k].update(v)
                    else:
                        cur[k] = v
                db["look"] = clean_look(cur)
                save_db(db)
                return self.send_json(dict(db, role=role))

            if head == "settings" and method == "PUT":
                b = self.body()
                if not designer:      # the keeper manages his profile, not the site's frame
                    b = {k: v for k, v in b.items() if k in KEEPER_SETTINGS}
                st = db["settings"]
                for k, lim in (("siteTitle", 80), ("tagline", 200), ("artistName", 80), ("about", 4000)):
                    if k in b:
                        st[k] = s(b[k], lim)
                if "featuredId" in b:
                    st["featuredId"] = b["featuredId"] if any(a["id"] == b["featuredId"] for a in db["artworks"]) else ""
                if "portraitCaption" in b:
                    st["portraitCaption"] = s(b["portraitCaption"], 200)
                if "portraitLink" in b:
                    st["portraitLink"] = clean_url(b["portraitLink"])
                if b.get("portraitUpload"):
                    old = st.get("portraitImage")
                    st["portraitImage"] = store_data_url(b["portraitUpload"], "portrait-" + secrets.token_hex(3))[0]
                    if old and old != st["portraitImage"]:
                        remove_upload(old)
                if b.get("defaultLayout") in GALLERY_LAYOUTS:
                    st["defaultLayout"] = b["defaultLayout"]
                if str(b.get("galleryColumns", "")) in ("auto", "2", "3", "4", "5", "6"):
                    st["galleryColumns"] = str(b["galleryColumns"])
                if b.get("gallerySpacing") in ("tight", "normal", "airy"):
                    st["gallerySpacing"] = b["gallerySpacing"]
                if b.get("defaultFrame") in DISPLAY_CHOICES["border"]:
                    st["defaultFrame"] = b["defaultFrame"]
                if "links" in b:
                    st["links"] = clean_links(b["links"])
                if "categories" in b:
                    st["categories"] = clean_list(b["categories"], 60)
                if "commentsOn" in b:
                    st["commentsOn"] = bool(b["commentsOn"])
                save_db(db)
                return self.send_json(dict(db, look=clean_look(db.get("look")), role=role))

            if head == "comments" and method == "DELETE" and len(parts) == 2:
                db["comments"] = [c for c in db.get("comments", []) if c["id"] != parts[1]]
                save_db(db)
                return self.send_json(dict(db, look=clean_look(db.get("look")), role=role))

            if head == "artworks":
                return self.artworks(method, parts[1:], db)

            if head in ("collections", "journal"):
                return self.simple(head, method, parts[1:], db)

            if head in ("tags", "categories") and method == "POST" and parts[1:] == ["rename"]:
                b = self.body()
                old, new = s(b.get("from"), 60), s(b.get("to"), 60)
                for a in db["artworks"]:
                    if head == "tags":
                        tags = [new if t.lower() == old.lower() else t for t in a["tags"]]
                        a["tags"] = clean_list([t for t in tags if t])
                    elif a["category"].lower() == old.lower():
                        a["category"] = new
                if head == "categories":
                    cats = [new if c.lower() == old.lower() else c for c in db["settings"].get("categories", [])]
                    db["settings"]["categories"] = clean_list([c for c in cats if c], 60)
                save_db(db)
                return self.send_json(db)

        return self.err("Unknown path", 404)

    def artworks(self, method, rest, db):
        arts = db["artworks"]
        if method == "POST" and rest == ["restyle"]:       # one frame / mat / caption style for every piece
            b = self.body()
            for key in ("border", "mat", "caption", "background", "animation"):
                if b.get(key) in DISPLAY_CHOICES[key]:
                    for a in arts:
                        a["display"] = clean_display(dict(a.get("display") or {}, **{key: b[key]}))
            save_db(db)
            return self.send_json(db)

        if method == "POST" and rest == ["reorder"]:
            order = self.body().get("ids") or []
            pos = {i: n for n, i in enumerate(order)}
            arts.sort(key=lambda a: pos.get(a["id"], 10 ** 6))
            save_db(db)
            return self.send_json(db)

        if method == "POST" and not rest:
            b = self.body()
            if not b.get("image"):
                return self.err("Choose an image to upload.")
            aid = new_id()
            img, w, h = store_data_url(b["image"], aid)
            thumb = store_data_url(b["thumb"], aid + "-t")[0] if b.get("thumb") else img
            art = {"id": aid, "image": img, "thumb": thumb, "width": w, "height": h,
                   "created": now(), "updated": now()}
            apply_art_meta(art, b.get("meta") or {}, db)
            arts.insert(0, art)
            save_db(db)
            return self.send_json({"db": db, "id": aid})

        art = next((a for a in arts if rest and a["id"] == rest[0]), None)
        if not art:
            return self.err("That artwork is not in the archive.", 404)

        if method == "PUT":
            b = self.body()
            if b.get("image"):
                old = (art["image"], art["thumb"])
                stem = f"{art['id']}-{secrets.token_hex(3)}"
                art["image"], art["width"], art["height"] = store_data_url(b["image"], stem)
                art["thumb"] = store_data_url(b["thumb"], stem + "-t")[0] if b.get("thumb") else art["image"]
                for u in set(old):
                    remove_upload(u)
            apply_art_meta(art, b.get("meta") or {}, db)
            art["updated"] = now()
            save_db(db)
            return self.send_json({"db": db, "id": art["id"]})

        if method == "DELETE":
            for u in {art["image"], art["thumb"]}:
                remove_upload(u)
            db["artworks"] = [a for a in arts if a["id"] != art["id"]]
            for c in db["collections"]:
                c["artworks"] = [i for i in c["artworks"] if i != art["id"]]
                if c.get("cover") == art["id"]:
                    c["cover"] = c["artworks"][0] if c["artworks"] else ""
            if db["settings"].get("featuredId") == art["id"]:
                db["settings"]["featuredId"] = ""
            db["comments"] = [c for c in db.get("comments", []) if c["art"] != art["id"]]
            save_db(db)
            return self.send_json({"db": db})
        return self.err("Unknown path", 404)

    def simple(self, kind, method, rest, db):
        items = db[kind]
        ids = {a["id"] for a in db["artworks"]}

        def fill(item, b):
            if kind == "collections":
                item["name"] = s(b.get("name"), 100) or "Unnamed Collection"
                item["description"] = s(b.get("description"), 2000)
                item["artworks"] = [i for i in (b.get("artworks") or []) if i in ids]
                item["cover"] = b.get("cover") if b.get("cover") in item["artworks"] else (item["artworks"][0] if item["artworks"] else "")
            else:
                item["title"] = s(b.get("title"), 160) or "Untitled Entry"
                item["body"] = s(b.get("body"), 50000)
                item["date"] = s(b.get("date"), 10) if re.match(r"^\d{4}-\d{2}-\d{2}$", s(b.get("date"), 10)) else time.strftime("%Y-%m-%d")
                item["published"] = bool(b.get("published"))

        if method == "POST" and rest == ["reorder"] and kind == "collections":
            pos = {i: n for n, i in enumerate(self.body().get("ids") or [])}
            items.sort(key=lambda c: pos.get(c["id"], 10 ** 6))
        elif method == "POST" and not rest:
            item = {"id": new_id(), "created": now()}
            fill(item, self.body())
            items.insert(0, item) if kind == "journal" else items.append(item)
        else:
            item = next((x for x in items if rest and x["id"] == rest[0]), None)
            if not item:
                return self.err("Not found", 404)
            if method == "PUT":
                fill(item, self.body())
            elif method == "DELETE":
                db[kind] = [x for x in items if x["id"] != item["id"]]
            else:
                return self.err("Unknown path", 404)
        save_db(db)
        return self.send_json(db)


class ArchiveServer(ThreadingHTTPServer):
    """Only one copy may hold the address. On Windows, Python's default lets a second copy share the port,
    so an old copy that is still running keeps answering and the site looks like it never updated."""
    allow_reuse_address = os.name != "nt"
    daemon_threads = True

    def server_bind(self):
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def ask_password(role="keeper"):
    print(f"\n  Choose the {role} password for the BRIAR CHRONICLES dashboard.")
    print(f"  (Typing is hidden. At least {MIN_PW} characters.)\n")
    while True:
        a = getpass.getpass("  Password: ")
        if len(a) < MIN_PW:
            print(f"  Too short. Use at least {MIN_PW} characters.\n")
            continue
        if getpass.getpass("  Again:    ") != a:
            print("  Those did not match. Try again.\n")
            continue
        set_pw(a, role)
        print("  Sealed. Keep it somewhere safe.\n")
        return


def main():
    os.makedirs(UPLOADS, exist_ok=True)
    if "--set-password" in sys.argv:
        ask_password("designer" if "--designer" in sys.argv else "keeper")
        return
    auth = load_auth()
    if "keeper" not in auth:
        env = os.environ.get("BRIAR_PASSWORD", "")
        set_pw(env if len(env) >= MIN_PW else DEFAULT_PASSWORD, "keeper")
        auth = load_auth()
    if "designer" not in auth:
        env = os.environ.get("BRIAR_DESIGNER_PASSWORD", "")
        if len(env) >= MIN_PW:
            set_pw(env, "designer")
        else:                               # the designer's starting key, stored only as its scrypt hash
            auth["designer"] = dict(DESIGNER_START, set=now())
            write_json(AUTH_PATH, auth)
    db = load_db()
    if db is None:
        seed_db()
    elif fix_first_build(db) | ensure_seeds(db) | refresh_copy(db):
        save_db(db)
        print("  The archive was updated to this version.")
    try:
        httpd = ArchiveServer((HOST, PORT), Handler)
    except OSError:
        running = None
        try:
            import urllib.request
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/version", timeout=3) as r:
                running = json.loads(r.read()).get("version")
        except Exception:
            pass
        print("\n  " + "=" * 62)
        if running == VERSION:
            print(f"  BRIAR CHRONICLES (version {VERSION}) is already running in another window.")
            print(f"  Just use it at http://localhost:{PORT}/")
        else:
            print("  AN OLDER COPY OF BRIAR CHRONICLES IS STILL RUNNING.")
            print("  That is why the site still looks old.")
            print("")
            print("  1. Close ALL the other black BRIAR CHRONICLES windows.")
            print("  2. Then double-click START BRIAR CHRONICLES in this folder again.")
        print("  " + "=" * 62 + "\n")
        sys.exit(1)
    shown = "localhost" if HOST in ("127.0.0.1", "0.0.0.0") else HOST
    print(f"\n  BRIAR CHRONICLES (version {VERSION}) is open.\n")
    print(f"    Running from  {ROOT}")
    print(f"    Gallery    http://{shown}:{PORT}/")
    print(f"    Dashboard  http://{shown}:{PORT}/admin\n")
    print("  Leave this window open while the archive is running. Ctrl+C to close it.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  The candles go out.")


if __name__ == "__main__":
    main()
