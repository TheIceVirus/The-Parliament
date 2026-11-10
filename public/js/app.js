import { esc, card, frame, infoHTML, paragraphs, display, bgValue } from "./relic.js";
import { buildCathedral, stars, embers, parallax, watcher, glints } from "./fx.js";
import { buildRose, buildArcade, buildCandles, buildRays, motes, shatterRose } from "./sanctum.js";
import { Sound } from "./audio.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("briar." + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("briar." + k, JSON.stringify(v)); } catch {} },
};
const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
};

const state = {
  data: null,
  look: null,
  layout: null,
  q: "", cat: "", tag: "",
  list: [],          // what the viewer can step through
  withSound: false,
};
const params = new URLSearchParams(location.search);
const preview = params.get("preview") === "1";
const embedded = params.get("embed") === "1";          // the designer's live preview frame
const sound = new Sound();

/* ═════════════ the designer's look ═════════════ */
const FONT_SPEC = {
  "Cinzel Decorative": ["Cinzel+Decorative:wght@400;700", 700], "UnifrakturMaguntia": ["UnifrakturMaguntia", 400],
  "Grenze Gotisch": ["Grenze+Gotisch:wght@400;700", 700], "Pirata One": ["Pirata+One", 400], "Cormorant SC": ["Cormorant+SC:wght@400;600;700", 600],
  "Cinzel": ["Cinzel:wght@400;500;600;700", 700], "Playfair Display SC": ["Playfair+Display+SC:wght@400;700", 700],
  "IM Fell English SC": ["IM+Fell+English+SC", 400], "Marcellus SC": ["Marcellus+SC", 400],
  "Cormorant Garamond": ["Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400", 400], "EB Garamond": ["EB+Garamond:ital,wght@0,400;0,500;1,400", 400],
  "Crimson Pro": ["Crimson+Pro:ital,wght@0,400;0,500;1,400", 400], "Spectral": ["Spectral:ital,wght@0,400;0,500;1,400", 400],
  "Lora": ["Lora:ital,wght@0,400;0,500;1,400", 400], "IM Fell English": ["IM+Fell+English:ital@0;1", 400],
};
const BUILT_IN = new Set(["Cinzel Decorative", "Cinzel", "Cormorant Garamond", "IM Fell English"]);

export function applyLook(look) {
  if (!look) return;
  const prevGlass = state.look && state.look.glass.join();
  state.look = look;
  const r = document.documentElement.style, c = look.colors;
  const map = { crimson: "--crimson", crimsonHot: "--crimson-hot", blood: "--blood", burgundy: "--burgundy", ivory: "--ivory", silver: "--silver", black: "--black", gold: "--gold", moon: "--moon" };
  for (const [k, v] of Object.entries(map)) if (c[k]) r.setProperty(v, c[k]);
  r.setProperty("--ivory-dim", `color-mix(in srgb, ${c.ivory} 76%, #2e2a26)`);
  r.setProperty("--silver-dim", `color-mix(in srgb, ${c.silver} 66%, #1a181c)`);
  r.setProperty("--silver-faint", `color-mix(in srgb, ${c.silver} 16%, transparent)`);
  look.glass.slice(0, 6).forEach((g, i) => r.setProperty(`--g${i}`, g));
  const fam = (n, fb) => `"${n}", ${fb}`;
  r.setProperty("--f-title", fam(look.fonts.title, "Georgia, serif"));
  r.setProperty("--f-head", fam(look.fonts.head, "Georgia, serif"));
  r.setProperty("--f-body", fam(look.fonts.body, "Georgia, serif"));
  r.setProperty("--title-w", FONT_SPEC[look.fonts.title]?.[1] ?? 700);
  const need = Object.values(look.fonts).filter((n) => !BUILT_IN.has(n) && FONT_SPEC[n]);
  let link = $("#lookFonts");
  if (need.length) {
    const href = `https://fonts.googleapis.com/css2?${need.map((n) => "family=" + FONT_SPEC[n][0]).join("&")}&display=swap`;
    if (!link) { link = document.createElement("link"); link.id = "lookFonts"; link.rel = "stylesheet"; document.head.appendChild(link); }
    if (link.href !== href) link.href = href;
  }
  const it = look.intro;
  $("#introInscription").textContent = it.inscription;
  $("#enterText").textContent = it.button;
  $("#introHint").textContent = it.hint;
  $("#beginText").textContent = it.beginText;
  for (const [k, v] of Object.entries(look.nav)) { const a = $(`#nav a[data-route="${k}"]`); if (a) a.textContent = v; }
  const e = look.effects, b = document.body.classList;
  for (const k of ["fog", "watcher", "moon", "rays", "candles", "parallax", "sparkles"]) b.toggle(`no-${k}`, !e[k]);
  let css = $("#lookCSS");
  if (!css) { css = document.createElement("style"); css.id = "lookCSS"; document.head.appendChild(css); }
  css.textContent = look.customCSS || "";
  if (prevGlass !== undefined && prevGlass !== look.glass.join()) buildRose($("#rose"), look.glass);
}

/* ═════════════ boot ═════════════ */
async function boot() {
  try {
    const r = await fetch(`/api/public${preview ? "?preview=1" : ""}`, { credentials: "same-origin" });
    state.data = await r.json();
  } catch {
    state.data = { settings: {}, artworks: [], collections: [], journal: [] };
  }
  applyLook(state.data.look);
  const look = state.look || { glass: ["#d81f35", "#9c1024", "#5a0716", "#1f4fd1", "#6b2bb8", "#e8a23a"], intro: { enabled: true, soundChoice: true }, effects: { embers: 50 } };

  buildCathedral($("#cathedral"));
  stars($("#stars"));
  embers($("#embers"), () => state.look?.effects.embers ?? 50);
  parallax($("#candlelight"));
  watcher($("#watcher"));
  glints([$("#glintsSanctum"), $("#glintsWorld")], () => state.look?.effects.sparkles !== false);
  buildRose($("#rose"), look.glass);
  buildArcade($("#arcade"));
  buildCandles($("#candles"));
  buildRays($("#rays"));
  state.stopMotes = motes($("#motes"));

  const st = state.data.settings || {};
  state.layout = store.get("layout", st.defaultLayout || "masonry");
  state.cols = /^[2-6]$/.test(String(st.galleryColumns || "")) ? String(st.galleryColumns) : "";
  const rs = document.documentElement.style;
  if (state.cols) { rs.setProperty("--cols", state.cols); rs.setProperty("--colw", "180px"); }
  rs.setProperty("--gap", { tight: ".7rem", airy: "2.8rem" }[st.gallerySpacing] || "1.6rem");
  if (st.siteTitle) { $("#introTitle").textContent = st.siteTitle; $("#brandText").textContent = st.siteTitle; document.title = titleCase(st.siteTitle); }
  splitTitle();
  if (st.tagline) $("#introTagline").textContent = st.tagline;
  $("#footerLine").textContent = `Art by ${st.artistName || "the artist"}.`;
  if (state.data.version) $("#footerVersion").textContent = `Version ${state.data.version}`;
  $("#previewBanner").hidden = !state.data.preview || embedded;

  wireChrome();
  requestAnimationFrame(() => document.body.classList.remove("is-loading"));

  const deep = location.hash && location.hash !== "#/" && location.hash !== "#";
  if (!look.intro.enabled || deep || (!embedded && session.get("briar.entered"))) showArchive(false);
  else openThreshold();
}

function titleCase(s) { return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

function splitTitle() {
  const h = $("#introTitle"), text = h.textContent;
  h.setAttribute("aria-label", text);
  let i = 0;
  h.innerHTML = text.split(" ").map((word) => `<span class="word" aria-hidden="true">${[...word].map((ch) =>
    `<span class="ch" style="--cd:${(0.3 + i++ * 0.08).toFixed(2)}s">${esc(ch)}</span>`).join("")}</span>`).join(" ");
}

/* ═════════════ threshold ═════════════ */
function openThreshold() {
  const th = $("#threshold");
  if (state.look?.intro.soundChoice === false) { th.hidden = true; return setTimeout(() => kindle(false), 700); }
  th.hidden = false; th.classList.remove("gone");
  $("#beginSound").focus({ preventScroll: true });
}

function kindle(withSound) {
  state.withSound = withSound;
  const th = $("#threshold");
  th.classList.add("gone");
  setTimeout(() => (th.hidden = true), 1200);
  $("#sanctum").classList.add("kindled");
  if (withSound) sound.prelude();
  setTimeout(() => {
    $("#intro").classList.add("titled");
    setTimeout(() => $("#enterBtn").focus({ preventScroll: true }), 4600);
  }, 2000);
}

function enter() {
  const b = document.body;
  b.classList.add("crossing", "veiling");
  $("#sanctum").classList.add("shattering");
  shatterRose($("#rose"));
  if (state.withSound) sound.shatter();
  if (!embedded) session.set("briar.entered", "1");
  setTimeout(() => { showArchive(true); state.stopMotes?.(); }, 1950);
  setTimeout(() => b.classList.remove("veiling", "crossing"), 3500);
}

function showArchive(animated) {
  $("#intro").hidden = true;
  $("#app").hidden = false;
  document.body.classList.add("in-archive");
  if (animated) {
    document.body.classList.add("arriving");
    setTimeout(() => document.body.classList.remove("arriving"), 2400);
  }
  if (!location.hash || location.hash === "#/") history.replaceState(null, "", "#/archive");
  route();
}

function returnToThreshold() {
  closeViewer(true);
  document.body.classList.remove("in-archive");
  $("#app").hidden = true;
  const intro = $("#intro");
  intro.hidden = false;
  intro.classList.remove("titled");
  $("#sanctum").classList.remove("kindled", "shattering");
  buildRose($("#rose"), state.look?.glass || ["#d81f35", "#9c1024", "#5a0716", "#1f4fd1", "#6b2bb8", "#e8a23a"]);
  state.stopMotes = motes($("#motes"));
  history.replaceState(null, "", location.pathname + location.search);
  scrollTo(0, 0);
  openThreshold();
}

// the designer's dashboard talks to this page when it is shown inside the live preview
addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === "briar-look") applyLook(e.data.look);
  if (e.data.type === "briar-replay") returnToThreshold();
  if (e.data.type === "briar-archive" && !$("#intro").hidden) { $("#intro").hidden = true; showArchive(false); }
});

/* ═════════════ chrome ═════════════ */
function wireChrome() {
  $("#enterBtn").addEventListener("click", enter);
  $("#beginSound").addEventListener("click", () => kindle(true));
  $("#beginSilent").addEventListener("click", () => kindle(false));
  $("#replayIntro").addEventListener("click", returnToThreshold);
  const toggle = $("#navToggle"), nav = $("#nav");
  toggle.addEventListener("click", () => {
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); } });

  const audio = $("#audioToggle");
  audio.addEventListener("click", async () => {
    const on = await sound.toggleAmbient();
    audio.setAttribute("aria-pressed", on);
    $(".audio-label", audio).textContent = on ? "Sound on" : "Sound off";
  });

  addEventListener("hashchange", () => { if (!$("#app").hidden) route(); });

  // viewer controls
  $("#viewerClose").addEventListener("click", () => closeViewer());
  $("#viewerPrev").addEventListener("click", () => step(-1));
  $("#viewerNext").addEventListener("click", () => step(1));
  $("#viewer").addEventListener("keydown", viewerKeys);
  let tx = 0;
  $("#viewerStage").addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; }, { passive: true });
  $("#viewerStage").addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  });
  $("#viewerStage").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeViewer(); });

  // one delegated listener opens any relic card on the page
  $("#main").addEventListener("click", (e) => {
    const b = e.target.closest("[data-id].relic, [data-open]");
    if (!b) return;
    e.preventDefault();
    openViewer(b.dataset.id || b.dataset.open, b.querySelector("img") || b);
  });
}

/* ═════════════ router ═════════════ */
const pages = { archive, collections, collection, journal, entry, relics, beyond, art };
let firstRoute = true;

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [name = "archive", id] = path.split("/");
  const params = new URLSearchParams(query);
  const page = { collection: "collection", art: "art" }[name] || (name === "journal" && id ? "entry" : name);
  const render = pages[page] || archive;
  const section = { collection: "collections", entry: "journal", art: "archive" }[page] || page;

  $$("#nav a").forEach((a) => a.dataset.route === section ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));

  const main = $("#main");
  const swap = () => {
    closeViewer(true);
    main.innerHTML = render(id, params) || "";
    main.classList.remove("page-out");
    main.classList.add("page-in");
    setTimeout(() => main.classList.remove("page-in"), 900);
    afterRender();
    if (!firstRoute) { scrollTo({ top: 0, behavior: "instant" }); main.focus({ preventScroll: true }); }
    firstRoute = false;
  };
  if (firstRoute || matchMedia("(prefers-reduced-motion: reduce)").matches) swap();
  else { main.classList.add("page-out"); setTimeout(swap, 380); }
}

function afterRender() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("shown"); io.unobserve(en.target); }
  }, { rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
  wireArchiveControls();
  loadComments();
}

/* ═════════════ helpers ═════════════ */
const D = () => state.data;
const arts = () => D().artworks;
const byId = (id) => arts().find((a) => a.id === id);
const colsFor = (a) => D().collections.filter((c) => c.artworks.includes(a.id));

function head(eyebrow, title, sub) {
  return `<header class="page-head"><p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title">${esc(title)}</h1>
    ${sub ? `<p class="page-sub">${esc(sub)}</p>` : ""}<div class="divider" aria-hidden="true">✦</div></header>`;
}

function galleryHTML(list, layout = state.layout) {
  state.list = list.map((a) => a.id);
  if (!list.length) return `<p class="empty">Nothing here yet.</p>`;
  const cards = list.map((a, i) => card(a, { layout, draft: D().preview, index: i })).join("");
  if (layout === "immersive") {
    return `<div class="gallery immersive" id="gallery" tabindex="0" aria-label="Full-screen gallery. Use the arrow keys.">${cards}</div>
      <div class="immersive-nav"><button class="btn ghost" type="button" data-slide="-1" aria-label="Previous">‹</button>
      <span id="slideCount">1 / ${list.length}</span><button class="btn ghost" type="button" data-slide="1" aria-label="Next">›</button></div>`;
  }
  return `<div class="gallery ${layout}${state.cols ? " fixed-cols" : ""}" id="gallery">${cards}</div>`;
}

const ICONS = {
  masonry: `<svg viewBox="0 0 20 20"><rect x="1" y="1" width="8" height="11"/><rect x="11" y="1" width="8" height="6"/><rect x="1" y="14" width="8" height="5"/><rect x="11" y="9" width="8" height="10"/></svg>`,
  grid: `<svg viewBox="0 0 20 20"><rect x="1" y="1" width="8" height="8"/><rect x="11" y="1" width="8" height="8"/><rect x="1" y="11" width="8" height="8"/><rect x="11" y="11" width="8" height="8"/></svg>`,
  immersive: `<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14"/><path d="M0 8l2 2-2 2zM20 8l-2 2 2 2z"/></svg>`,
};

function controlsHTML(list) {
  const cats = [...new Set(list.map((a) => a.category).filter(Boolean))].sort();
  const tags = [...new Set(list.flatMap((a) => a.tags || []))].sort((a, b) => a.localeCompare(b));
  return `<div class="controls" role="search">
    <label class="field"><span class="sr">Search the archive</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6"/><path d="M13 13l5 5"/></svg>
      <input class="search" id="q" type="search" placeholder="Search by title, tag or description" value="${esc(state.q)}" autocomplete="off"></label>
    <label><span class="sr">Category</span><select class="select" id="cat"><option value="">All categories</option>
      ${cats.map((c) => `<option ${c === state.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <div class="layouts" role="group" aria-label="Gallery layout">
      ${["masonry", "grid", "immersive"].map((l) => `<button type="button" data-layout="${l}" aria-pressed="${state.layout === l}" title="${titleCase(l)}">${ICONS[l]}<span class="sr">${l}</span></button>`).join("")}
    </div>
    ${tags.length ? `<div class="tags" role="group" aria-label="Filter by inscription">${tags.map((t) => `<button type="button" class="tag" data-tag="${esc(t)}" aria-pressed="${t === state.tag}">${esc(t)}</button>`).join("")}</div>` : ""}
  </div>`;
}

function filtered(list) {
  const q = state.q.trim().toLowerCase();
  return list.filter((a) => {
    if (state.cat && a.category !== state.cat) return false;
    if (state.tag && !(a.tags || []).includes(state.tag)) return false;
    if (!q) return true;
    return [a.title, a.description, a.category, a.year, ...(a.tags || [])].join(" ").toLowerCase().includes(q);
  });
}

function wireArchiveControls() {
  const q = $("#q"), cat = $("#cat");
  const scope = $("#main").dataset.scope;
  const refresh = () => {
    const base = scope ? (D().collections.find((c) => c.id === scope)?.artworks || []).map(byId).filter(Boolean) : arts();
    const list = filtered(base);
    $("#galleryWrap").innerHTML = galleryHTML(list);
    $("#count").textContent = countText(list.length);
    $("#live").textContent = countText(list.length);
    afterRenderGallery();
  };
  if (q) {
    let t;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = q.value; refresh(); }, 180); });
    cat.addEventListener("change", () => { state.cat = cat.value; refresh(); });
    $$(".tag[data-tag]").forEach((b) => b.addEventListener("click", () => {
      state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag;
      $$(".tag[data-tag]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.tag === state.tag));
      refresh();
    }));
    $$("[data-layout]").forEach((b) => b.addEventListener("click", () => {
      state.layout = b.dataset.layout; store.set("layout", state.layout);
      $$("[data-layout]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      refresh();
    }));
  }
  afterRenderGallery();
}

function afterRenderGallery() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("shown"); io.unobserve(en.target); }
  }, { rootMargin: "0px 0px -6% 0px" });
  $$("#galleryWrap .reveal:not(.shown)").forEach((el) => io.observe(el));
  const g = $("#gallery.immersive");
  if (!g) return;
  const slides = $$(".slide", g);
  slides.forEach((s) => { const a = byId($(".relic", s).dataset.id); if (a) s.style.setProperty("--bg", bgValue(a)); });
  const go = (d) => g.scrollBy({ left: d * g.clientWidth, behavior: "smooth" });
  $$("[data-slide]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.slide)));
  g.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); });
  g.addEventListener("scroll", () => {
    const i = Math.round(g.scrollLeft / g.clientWidth);
    $("#slideCount").textContent = `${i + 1} / ${slides.length}`;
  }, { passive: true });
}

const countText = (n) => n === 1 ? "1 piece" : `${n} pieces`;

/* ═════════════ pages ═════════════ */
function archive(_, params) {
  if (params?.get("tag")) { state.tag = params.get("tag"); state.q = ""; state.cat = ""; }
  $("#main").dataset.scope = "";
  const st = D().settings;
  const feat = byId(st.featuredId) || arts().find((a) => a.featured) || arts()[0];
  const list = filtered(arts());
  const altar = feat && !state.tag && !state.q && !state.cat ? `
    <section class="altar" aria-label="Upon the altar">
      <button class="altar-frame reveal anim-glow shown" type="button" data-open="${esc(feat.id)}" aria-label="Open ${esc(feat.title)}">
        ${frame(feat)}
      </button>
      <div class="altar-text">
        <p class="eyebrow">Featured</p>
        <h2 class="altar-title">${esc(feat.title)}</h2>
        <p class="altar-desc">${esc(feat.description).slice(0, 320)}${(feat.description || "").length > 320 ? "…" : ""}</p>
        <a class="btn" href="#/art/${esc(feat.id)}">View</a>
      </div>
    </section>` : "";
  return `${head("The Archive", "The Gallery", "All of the work in one place.")}
    ${altar}${controlsHTML(arts())}
    <p class="count" id="count">${countText(list.length)}</p>
    <div id="galleryWrap">${galleryHTML(list)}</div>`;
}

function collections() {
  $("#main").dataset.scope = "";
  const cols = D().collections.filter((c) => c.artworks.length);
  state.list = [];
  return `${head("The Collections", "Collections", "Pieces grouped by theme.")}
    ${cols.length ? `<div class="collections">${cols.map((c, i) => {
      const cover = byId(c.cover) || byId(c.artworks[0]);
      return `<a class="vault reveal anim-rise" href="#/collection/${esc(c.id)}" style="animation-delay:${i * 0.12}s">
        <div class="vault-arch">${cover ? `<img src="${esc(cover.thumb || cover.image)}" alt="" loading="lazy" decoding="async">` : ""}</div>
        <h2 class="vault-name">${esc(c.name)}</h2>
        ${c.description ? `<p class="vault-desc">${esc(c.description)}</p>` : ""}
        <span class="vault-count">${c.artworks.length} ${c.artworks.length === 1 ? "piece" : "pieces"}</span></a>`;
    }).join("")}</div>` : `<p class="empty">No collections yet.</p>`}`;
}

function collection(id) {
  const c = D().collections.find((x) => x.id === id);
  if (!c) return notFound();
  $("#main").dataset.scope = c.id;
  const list = filtered(c.artworks.map(byId).filter(Boolean));
  return `<p style="max-width:1480px;margin:2rem auto 0"><a class="back" href="#/collections">← The Collections</a></p>
    ${head("Collection", c.name, c.description)}
    ${controlsHTML(c.artworks.map(byId).filter(Boolean))}
    <p class="count" id="count">${countText(list.length)}</p>
    <div id="galleryWrap">${galleryHTML(list)}</div>`;
}

function journal() {
  state.list = [];
  const list = D().journal;
  return `${head("The Journal", "Journal", "Notes and updates from the artist.")}
    ${list.length ? `<div class="journal-list">${list.map((j, i) => `
      <a class="entry-card reveal anim-rise" href="#/journal/${esc(j.id)}" style="animation-delay:${i * 0.08}s">
        <span class="entry-date">${esc(fmtDate(j.date))}${j.published ? "" : " · draft"}</span>
        <span><h2 class="entry-title">${esc(j.title)}</h2><p class="entry-excerpt">${esc((j.body || "").replace(/\s+/g, " ").slice(0, 180))}${(j.body || "").length > 180 ? "…" : ""}</p></span>
      </a>`).join("")}</div>` : `<p class="empty">No entries yet.</p>`}`;
}

function entry(id) {
  const j = D().journal.find((x) => x.id === id);
  if (!j) return notFound();
  state.list = [];
  return `<article class="entry"><p style="margin-top:2rem"><a class="back" href="#/journal">← The Journal</a></p>
    ${head(fmtDate(j.date), j.title)}
    <div class="entry-body reveal anim-fade">${paragraphs(j.body)}</div></article>`;
}

function relics() {
  $("#main").dataset.scope = "";
  const list = arts().filter((a) => a.featured);
  state.list = list.map((a) => a.id);
  return `${head("The Relics", "Favorites", "The pieces he likes best.")}
    ${list.length ? `<div class="reliquary">${list.map((a, i) => `
      <section class="niche">
        <div class="niche-art reveal anim-${display(a).animation === "none" ? "fade" : display(a).animation}">
          <button class="relic" type="button" data-id="${esc(a.id)}" aria-label="Open ${esc(a.title)}">${frame(a, { full: false })}</button>
        </div>
        <div class="reveal anim-rise">
          <span class="niche-num">${toRoman(i + 1)}</span>
          <h2>${esc(a.title)}</h2>
          ${a.description ? `<p>${esc(a.description)}</p>` : ""}
          <a class="btn ghost" href="#/art/${esc(a.id)}">View piece</a>
        </div>
      </section>`).join("")}</div>` : `<p class="empty">Nothing featured yet.</p>`}`;
}

const LINK_ICONS = {
  twitch: `<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>`,
  x: `<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>`,
  instagram: `<path fill-rule="evenodd" d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.2-9.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>`,
  youtube: `<path fill-rule="evenodd" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6z"/>`,
  door: `<path fill-rule="evenodd" d="M12 1C6.5 4 4.5 8 4.5 12.5V23h15V12.5C19.5 8 17.5 4 12 1zm-1 21v-9.5h2V22z"/>`,
  tiktok: `<path d="M16.6 1h-3.7v14.7a3.2 3.2 0 1 1-2.3-3.1V8.9a6.9 6.9 0 1 0 6 6.8V8.3a8.6 8.6 0 0 0 4.9 1.5V6.1a4.9 4.9 0 0 1-4.9-5.1z"/>`,
  bluesky: `<path d="M5.2 2.9C7.9 5 10.9 9.2 12 11.4c1.1-2.2 4.1-6.4 6.8-8.5 2-1.5 5.2-2.6 5.2 1 0 .7-.4 6-.7 6.9-.9 3.1-4.1 3.9-7 3.4 5 .9 6.3 3.7 3.5 6.5-5.2 5.4-7.5-1.3-8.1-3-.1-.3-.2-.5-.2-.3 0-.2-.1 0-.2.3-.6 1.7-2.9 8.4-8.1 3-2.8-2.8-1.5-5.6 3.5-6.5-2.9.5-6.1-.3-7-3.4C.4 9.9 0 4.6 0 3.9c0-3.6 3.2-2.5 5.2-1z"/>`,
  patreon: `<path d="M15.4 1.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6zM1 22.8h3.8V1.2H1z"/>`,
  deviantart: `<path d="M19 4.4V0h-4.4l-.4.5-2.1 4H5v6h3.8l.3.4L5 18.7v4.4h4.4l.4-.5 2.1-4H19v-6h-3.8l-.3-.4z"/>`,
  linktree: `<path d="M13.5 6.8l3.3-3.4 1.9 2-3.5 3.3h4.9v2.8h-4.9l3.5 3.4-1.9 1.9-4.8-4.8-4.8 4.8-1.9-1.9 3.5-3.4H3.9V8.7h4.9L5.3 5.4l1.9-2 3.3 3.4V2h3zm-3 8h3V22h-3z"/>`,
};
function iconFor(url) {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (h.includes("twitch")) return "twitch";
  if (h === "x.com" || h.includes("twitter")) return "x";
  if (h.includes("instagram")) return "instagram";
  if (h.includes("youtu")) return "youtube";
  if (h.includes("tiktok")) return "tiktok";
  if (h.includes("bsky")) return "bluesky";
  if (h.includes("patreon")) return "patreon";
  if (h.includes("deviantart")) return "deviantart";
  if (h.includes("linktr")) return "linktree";
  return "door";
}

function beyond() {
  state.list = [];
  const st = D().settings;
  const links = st.links || [];
  const pic = st.portraitImage ? `<img src="${esc(st.portraitImage)}" alt="${esc(st.artistName || "The artist")}’s profile picture" decoding="async">` : "";
  const portrait = !pic ? "" : `<figure class="beyond-id reveal anim-glow">
      ${st.portraitLink ? `<a class="beyond-portrait" href="${esc(st.portraitLink)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(st.artistName)} on Twitch">${pic}</a>` : `<div class="beyond-portrait">${pic}</div>`}
      ${st.portraitCaption ? `<figcaption class="beyond-caption">${st.portraitLink && iconFor(st.portraitLink) === "twitch" ? `<svg viewBox="0 0 24 24" aria-hidden="true">${LINK_ICONS.twitch}</svg>` : ""}${esc(st.portraitCaption)}</figcaption>` : ""}
    </figure>`;
  return `${head("Beyond the Cathedral", st.artistName || "The Artist", "Where else to find him.")}
    <section class="beyond">
      ${portrait}
      ${st.about ? `<p class="beyond-about">${esc(st.about)}</p>` : ""}
      <div class="doors">${links.map((l, i) => `
        <a class="door reveal anim-rise" style="animation-delay:${i * 0.1}s" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">${LINK_ICONS[iconFor(l.url)]}</svg>
          <span class="door-name">${esc(l.label)}</span>
          <span class="door-url">${esc(l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</span>
        </a>`).join("")}</div>
    </section>`;
}

function art(id) {
  const a = byId(id);
  if (!a) return notFound();
  const all = arts(), i = all.indexOf(a);
  const prev = all[(i - 1 + all.length) % all.length], next = all[(i + 1) % all.length];
  state.list = all.map((x) => x.id);
  const d = display(a);
  return `<article class="showcase">
    <a class="back" href="#/archive">← The Archive</a>
    <div class="showcase-grid">
      <div class="showcase-stage bg-${d.background} size-${d.size} reveal anim-${d.animation}">
        <button class="relic" type="button" data-id="${esc(a.id)}" aria-label="View ${esc(a.title)} full screen" style="cursor:zoom-in">${frame(a)}</button>
      </div>
      <div class="showcase-info">${infoHTML(a, { collections: colsFor(a), showcaseLink: false, headingTag: "h1" })}</div>
    </div>
    ${commentsOn() ? `<section class="comments reveal anim-fade" id="comments" data-art="${esc(a.id)}" aria-labelledby="commentsTitle">
      <h2 class="comments-title" id="commentsTitle">Comments</h2>
      <ol class="comment-list" id="commentList"><li class="comment-empty">Loading…</li></ol>
      <form class="comment-form" id="commentForm">
        <label class="cf"><span>Your name (optional)</span><input name="name" maxlength="40" autocomplete="nickname"></label>
        <label class="cf"><span>Comment</span><textarea name="text" maxlength="1000" rows="4" required></textarea></label>
        <label class="cf-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <div class="cf-row"><button class="btn" type="submit">Post comment</button><span class="cf-msg" id="commentMsg" role="status"></span></div>
      </form>
    </section>` : ""}
    ${all.length > 1 ? `<nav class="pager" aria-label="Previous and next">
      <a href="#/art/${esc(prev.id)}">← ${esc(prev.title)}</a><a href="#/art/${esc(next.id)}">${esc(next.title)} →</a></nav>` : ""}
  </article>`;
}

/* ═════════════ comments ═════════════ */
const commentsOn = () => D().settings?.commentsOn !== false;
const commentCount = (a) => (D().commentCounts || {})[a.id] || 0;
function viewLabel(a) {
  const n = commentCount(a);
  if (!commentsOn()) return "View piece";
  return n ? `View piece · ${n} ${n === 1 ? "comment" : "comments"}` : "View piece and comment";
}

function paintComments(list) {
  const ol = $("#commentList");
  if (!ol) return;
  ol.innerHTML = list.length ? list.map((c) => `<li class="comment">
      <p class="comment-head"><span class="comment-name">${esc(c.name)}</span><time datetime="${new Date(c.created * 1000).toISOString()}">${esc(when(c.created))}</time></p>
      <div class="comment-text">${paragraphs(c.text)}</div></li>`).join("")
    : `<li class="comment-empty">No comments yet. Be the first.</li>`;
}

function when(t) {
  return new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function loadComments() {
  const box = $("#comments");
  if (!box) return;
  const id = box.dataset.art;
  const form = $("#commentForm"), msg = $("#commentMsg");
  try {
    const r = await fetch(`/api/comments/${encodeURIComponent(id)}`, { credentials: "same-origin" });
    const d = await r.json();
    paintComments(d.comments || []);
    if (d.open === false) form.hidden = true;
  } catch { paintComments([]); }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form), btn = $("button", form);
    btn.disabled = true; msg.textContent = "Posting…"; msg.classList.remove("bad");
    try {
      const r = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Briar": "1" },
        body: JSON.stringify({ name: f.get("name"), text: f.get("text"), website: f.get("website") }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "That didn't post. Try again.");
      paintComments(d.comments || []);
      (D().commentCounts ||= {})[id] = (d.comments || []).length;
      form.text.value = "";
      msg.textContent = "Posted. Thank you!";
    } catch (err) { msg.textContent = err.message; msg.classList.add("bad"); }
    btn.disabled = false;
  });
}

function notFound() {
  state.list = [];
  return `${head("Not found", "Page not found", "This page doesn’t exist or was moved.")}
    <p style="text-align:center"><a class="btn" href="#/archive">Back to the gallery</a></p>`;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
function toRoman(n) {
  return [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]].reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, "");
}

/* ═════════════ viewer ═════════════ */
let vIndex = -1, lastFocus = null;

function openViewer(id, originEl) {
  const a = byId(id);
  if (!a) return;
  if (!state.list.includes(id)) state.list = [id];
  vIndex = state.list.indexOf(id);
  lastFocus = document.activeElement;
  const v = $("#viewer");
  v.hidden = false;
  v.classList.remove("closing");
  v.classList.add("opening");
  document.documentElement.style.overflow = "hidden";
  paintViewer(a, originEl);
  $("#viewerClose").focus({ preventScroll: true });
  setTimeout(() => v.classList.remove("opening"), 800);
}

function paintViewer(a, originEl) {
  $("#viewerBg").style.setProperty("--bg", bgValue(a));
  $("#viewerStage").innerHTML = frame(a);
  $("#viewerInfo").innerHTML = `<span class="viewer-count">${vIndex + 1} / ${state.list.length}</span>` +
    infoHTML(a, { collections: colsFor(a), headingId: "viewerTitle", linkLabel: viewLabel(a) });
  const multi = state.list.length > 1;
  $("#viewerPrev").hidden = $("#viewerNext").hidden = !multi;
  const img = $("#viewerStage img");
  // show the cached thumbnail at once, swap to full resolution when it arrives
  if (a.thumb && a.thumb !== a.image) {
    img.src = a.thumb;
    const full = new Image();
    full.onload = () => { img.src = a.image; };
    full.src = a.image;
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const to = img.getBoundingClientRect();
  if (originEl && originEl.getBoundingClientRect) {
    const from = originEl.getBoundingClientRect();
    if (from.width && to.width) {
      const sx = from.width / to.width, sy = from.height / to.height;
      img.animate([
        { transformOrigin: "0 0", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, filter: "brightness(1.3)" },
        { transformOrigin: "0 0", transform: "none", filter: "none" },
      ], { duration: 820, easing: "cubic-bezier(.22,.61,.36,1)" });
      return;
    }
  }
  const anim = display(a).animation;
  img.animate(anim === "glow"
    ? [{ opacity: 0, filter: "brightness(2) blur(6px)" }, { opacity: 1, filter: "none" }]
    : [{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "ease-out" });
}

function step(d) {
  if (state.list.length < 2) return;
  vIndex = (vIndex + d + state.list.length) % state.list.length;
  paintViewer(byId(state.list[vIndex]));
}

function closeViewer(instant) {
  const v = $("#viewer");
  if (v.hidden) return;
  document.documentElement.style.overflow = "";
  if (instant) { v.hidden = true; return; }
  v.classList.add("closing");
  setTimeout(() => { v.hidden = true; v.classList.remove("closing"); }, 420);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

function viewerKeys(e) {
  if (e.key === "Escape") return closeViewer();
  if (e.key === "ArrowRight") return step(1);
  if (e.key === "ArrowLeft") return step(-1);
  if (e.key === "Tab") {
    const f = $$("#viewer button:not([hidden]), #viewer a[href]");
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
// links inside the viewer that change the route should close it
document.addEventListener("click", (e) => { if (e.target.closest("#viewerInfo a[href^='#']")) closeViewer(true); });

boot();
