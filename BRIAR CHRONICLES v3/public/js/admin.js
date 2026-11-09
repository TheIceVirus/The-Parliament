import { esc, card, frame, infoHTML, display, bgValue } from "./relic.js";
import { buildRose } from "./sanctum.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let db = null;
let tab = "relics";
let dirty = false;
let role = null;

/* ═════════════ api ═════════════ */
async function api(method, path, body) {
  const r = await fetch(`/api/${path}`, {
    method, credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Briar": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "login" && path !== "password") { showGate(); throw new Error(data.error || "Signed out"); }
  if (!r.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg; t.classList.toggle("bad", bad); t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), bad ? 5000 : 2600);
}
async function attempt(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); throw e; }
}

/* ═════════════ gate ═════════════ */
function showGate() {
  $("#dash").hidden = true; $("#gate").hidden = false;
  setTimeout(() => $("#pw").focus(), 50);
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  try {
    await api("POST", "login", { password: $("#pw").value });
    $("#pw").value = "";
    await load();
  } catch (err) { $("#loginErr").textContent = err.message; }
});
$("#logout").addEventListener("click", async () => { await api("POST", "logout"); showGate(); });

async function load() {
  db = await api("GET", "admin");
  role = db.role;
  const designer = role === "designer";
  $$("[data-role=designer]").forEach((el) => (el.hidden = !designer));
  $$("[data-role=keeper]").forEach((el) => (el.hidden = designer));   // the designer has all of this in Appearance
  $("#whoami").textContent = designer ? "Signed in as the designer" : `Welcome back, ${db.settings.artistName || "keeper"}`;
  fetch("/api/version").then((r) => r.json()).then((v) => { $("#siteVersion").textContent = `Version ${v.version}`; }).catch(() => {});
  tab = designer ? "appearance" : "editor";
  $("#gate").hidden = true; $("#dash").hidden = false;
  render();
  if (!designer && !seenBirthday()) setTimeout(showBirthday, 600);
}

/* ═════════════ a birthday note, from SheDithers ═════════════ */
function seenBirthday() {
  try { if (sessionStorage.getItem("briar.bday")) return true; sessionStorage.setItem("briar.bday", "1"); } catch {}
  return false;
}
function showBirthday() {
  const box = $("#bday");
  const glass = (db.look && db.look.glass) || ["#d81f35", "#9c1024", "#5a0716", "#1f4fd1", "#6b2bb8", "#e8a23a"];
  buildRose($("#bdayRose"), glass);
  const cand = $(".bday-candles", box);
  cand.innerHTML = [-56, -28, 0, 28, 56].map((x, i) => `<span class="flame" style="--x:${x}px;--y:${i % 2 ? 6 : 0}px;--f:${(1.6 + i * 0.3).toFixed(2)}s"></span>`).join("");
  const title = $("#bdayTitle");
  let n = 0;
  title.innerHTML = "Happy Birthday".split(" ").map((w) => `<span class="word">${[...w].map((c) =>
    `<span class="ch" style="--cd:${(0.5 + n++ * 0.07).toFixed(2)}s">${c}</span>`).join("")}</span>`).join(" ");
  title.setAttribute("aria-label", "Happy Birthday");
  box.hidden = false; box.classList.remove("closing", "lit");
  requestAnimationFrame(() => box.classList.add("lit"));
  const layer = $("#bdayGlints", box);
  layer.innerHTML = "";
  const burst = (count, delay) => setTimeout(() => {
    if (box.hidden) return;
    for (let i = 0; i < count; i++) {
      const g = document.createElement("span");
      g.className = "glint";
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 22;
      g.style.cssText = `left:${(50 + Math.cos(a) * r).toFixed(1)}%;top:${(50 + Math.sin(a) * r).toFixed(1)}%;--s:${(5 + Math.random() * 9).toFixed(1)}px;--c:${["var(--gold)", "var(--ivory)", "var(--crimson-hot)"][i % 3]};--t:${(1.8 + Math.random() * 2).toFixed(2)}s;animation-delay:${(Math.random() * 1.2).toFixed(2)}s`;
      layer.appendChild(g);
      g.addEventListener("animationend", () => g.remove());
    }
  }, delay);
  burst(26, 900);
  box._twinkle = setInterval(() => burst(4, 0), 1400);
  setTimeout(() => $("#bdayClose").focus({ preventScroll: true }), 3000);
}
function closeBirthday() {
  const box = $("#bday");
  if (box.hidden) return;
  clearInterval(box._twinkle);
  box.classList.add("closing");
  setTimeout(() => { box.hidden = true; box.classList.remove("closing"); }, 600);
}
$("#bdayClose").addEventListener("click", closeBirthday);
$("#bdayOpen").addEventListener("click", showBirthday);
$(".bday-veil").addEventListener("click", closeBirthday);
addEventListener("keydown", (e) => { if (e.key === "Escape") closeBirthday(); });

/* ═════════════ shell ═════════════ */
$$(".tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
function go(t, arg) {
  if (dirty && !confirm("You have unsaved changes. Leave them behind?")) return;
  dirty = false;
  tab = t;
  render(arg);
  $("#panel").focus({ preventScroll: true });
  scrollTo(0, 0);
}
function render(arg) {
  $$(".tabs button").forEach((b) => b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  ({ relics, editor, collections, journal, labels, profile, words, layout, appearance, site })[tab](arg);
}
addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

const byId = (id) => db.artworks.find((a) => a.id === id);
const head = (title, sub, actions = "") => `<header class="panel-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div><div class="row-actions">${actions}</div></header>`;

/* ═════════════ artworks list ═════════════ */
function relics() {
  const p = $("#panel");
  p.innerHTML = head("Artworks", "Drag to reorder. The gallery uses the same order.",
    `<button class="btn" type="button" id="newArt">+ Upload one (with details)</button>
     <label class="btn ghost" style="position:relative">+ Quick upload several<input type="file" id="bulk" multiple accept="image/png,image/jpeg,image/webp,image/gif" style="position:absolute;inset:0;opacity:0;cursor:pointer" aria-label="Quick upload several images"></label>`) +
    `<p class="muted" id="bulkNote" style="margin-top:-.6rem">Quick upload publishes each image right away, titled from its file name. Click <b>Edit</b> afterwards to add details.</p>` +
    `<label class="f" style="max-width:420px;margin-bottom:1.2rem"><span class="sr">Find</span><input type="search" id="find" placeholder="Find an artwork…"></label>
     <div class="list" id="list"></div>`;
  $("#newArt").onclick = () => go("editor");
  $("#bulk").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    let done = 0;
    for (const file of files) {
      $("#bulkNote").textContent = `Uploading ${done + 1} of ${files.length}: ${file.name}…`;
      try {
        const up = await prepareImage(file);
        const body = { image: up.image, meta: { title: titleFromFile(file.name), published: true, display: display({}) } };
        if (up.thumb) body.thumb = up.thumb;
        db = (await api("POST", "artworks", body)).db;
        done++;
      } catch (err) { toast(`${file.name}: ${err.message}`, true); }
    }
    toast(`${done} of ${files.length} uploaded.`);
    relics();
  });
  const draw = () => {
    const q = $("#find").value.toLowerCase();
    const list = db.artworks.filter((a) => !q || (a.title + " " + a.tags.join(" ") + " " + a.category).toLowerCase().includes(q));
    $("#list").innerHTML = list.length ? list.map((a) => `
      <div class="item" draggable="${!q}" data-id="${a.id}">
        <button class="handle" type="button" aria-label="Drag to reorder" tabindex="-1">⋮⋮</button>
        <img src="${esc(a.thumb)}" alt="" loading="lazy">
        <div><div class="item-title">${esc(a.title)}
          ${a.published ? "" : '<span class="badge draft">Draft</span>'}
          ${a.featured ? '<span class="badge relic">Relic</span>' : ""}
          ${db.settings.featuredId === a.id ? '<span class="badge altar">Homepage</span>' : ""}</div>
          <div class="item-meta">${esc([a.category, a.year, a.tags.slice(0, 4).join(", ")].filter(Boolean).join(" · ")) || "&nbsp;"}</div></div>
        <div class="row-actions">
          <button class="icon-btn" type="button" data-act="up" aria-label="Move up" title="Move up">↑</button>
          <button class="icon-btn" type="button" data-act="down" aria-label="Move down" title="Move down">↓</button>
          <button class="icon-btn" type="button" data-act="feature" aria-pressed="${a.featured}" title="Show in The Relics">★</button>
          <button class="btn small ghost" type="button" data-act="publish">${a.published ? "Unpublish" : "Publish"}</button>
          <button class="btn small" type="button" data-act="edit">Edit</button>
          <button class="btn small ghost danger" type="button" data-act="delete">Delete</button>
        </div>
      </div>`).join("") : `<p class="muted">No artworks yet. Upload the first one.</p>`;
    wireDrag();
  };
  $("#find").addEventListener("input", draw);
  draw();

  $("#list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest(".item").dataset.id, a = byId(id);
    const act = b.dataset.act;
    if (act === "edit") return go("editor", id);
    if (act === "delete") {
      if (!confirm(`Delete “${a.title}” permanently? The image file is removed too, and this cannot be undone.`)) return;
      db = (await attempt(() => api("DELETE", `artworks/${id}`), "Deleted.")).db;
    } else if (act === "up" || act === "down") {
      const ids = db.artworks.map((x) => x.id), i = ids.indexOf(id), j = act === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      db = await attempt(() => api("POST", "artworks/reorder", { ids }));
    } else {
      const meta = metaOf(a);
      if (act === "feature") meta.featured = !a.featured;
      if (act === "publish") meta.published = !a.published;
      db = (await attempt(() => api("PUT", `artworks/${id}`, { meta }), act === "publish" ? (meta.published ? "Published." : "Hidden from visitors.") : "Saved.")).db;
    }
    draw();
  });

  function wireDrag() {
    let dragId = null;
    $$("#list .item[draggable=true]").forEach((el) => {
      el.addEventListener("dragstart", (e) => { dragId = el.dataset.id; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      el.addEventListener("dragend", () => { el.classList.remove("dragging"); $$(".drop-target").forEach((x) => x.classList.remove("drop-target")); });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drop-target"); });
      el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        const to = el.dataset.id; if (!dragId || dragId === to) return;
        const ids = db.artworks.map((x) => x.id).filter((x) => x !== dragId);
        ids.splice(ids.indexOf(to) + (db.artworks.findIndex((x) => x.id === dragId) < db.artworks.findIndex((x) => x.id === to) ? 1 : 0), 0, dragId);
        db = await attempt(() => api("POST", "artworks/reorder", { ids }), "Order saved.");
        draw();
      });
    });
  }
}

function metaOf(a) {
  return {
    title: a.title, description: a.description, tags: a.tags, category: a.category, links: a.links, year: a.year,
    featured: a.featured, published: a.published, alt: a.alt, display: { ...display(a) },
    collections: db.collections.filter((c) => c.artworks.includes(a.id)).map((c) => c.id),
  };
}

/* ═════════════ upload / edit ═════════════ */
const OPTS = {
  size: [["standard", "Standard"], ["wide", "Wide (spans two columns)"], ["tall", "Tall (spans two rows)"], ["large", "Large (two by two)"]],
  fit: [["contain", "Show the whole piece"], ["cover", "Fill the card (crop edges)"]],
  position: [["center", "Centre"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]],
  background: [["void", "Pure black"], ["stone", "Black stone"], ["crimson", "Crimson glow"], ["moonlit", "Moonlit"], ["stained", "Stained glass"], ["ivory", "Faded ivory"]],
  border: [["silver", "Antique silver"], ["gothic", "Gothic corners"], ["gilded", "Gilded"], ["reliquary", "Reliquary gold with gems"],
    ["arch", "Cathedral arch window"], ["briar", "Briar and roses"], ["stained", "Stained glass"], ["candle", "Candlelight glow"],
    ["iron", "Wrought iron"], ["crimson", "Crimson glow"], ["thin", "Thin line"], ["none", "No frame"]],
  mat: [["none", "No mat"], ["small", "Small mat"], ["large", "Wide mat"]],
  caption: [["hover", "Show title on hover"], ["always", "Always show title"], ["hidden", "Never show title"]],
  animation: [["fade", "Fade in slowly"], ["rise", "Rise from below"], ["glow", "Ignite with light"], ["ember", "Emerge from embers"], ["none", "No animation"]],
};
const sel = (name, val) => `<label class="f"><span>${{ size: "Display size", fit: "Image fit (grid view)", position: "Image position", background: "Background", border: "Frame", animation: "Entrance animation", mat: "Mat (space around the art)", caption: "Title on the card" }[name]}</span>
  <select data-d="${name}">${OPTS[name].map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;

function editor(id) {
  const existing = id ? byId(id) : null;
  const a = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: "new", title: "", description: "", tags: [], category: "", links: [], year: "", featured: false, published: true, alt: "",
    display: { ...display({}), border: db.settings.defaultFrame || "silver" }, image: "", thumb: "", width: 0, height: 0,
  };
  let upload = null; // { image, thumb, url, w, h }
  const inCols = new Set(existing ? db.collections.filter((c) => c.artworks.includes(existing.id)).map((c) => c.id) : []);
  const cats = [...new Set([...(db.settings.categories || []), ...db.artworks.map((x) => x.category).filter(Boolean)])];
  let pview = "card";

  $("#panel").innerHTML = head(existing ? `Edit “${existing.title}”` : "Upload artwork",
    "Changes appear in the preview as you type. Nothing is public until you save.") + `
  <form class="editor" id="ed" novalidate>
    <div class="stack">
      <div class="drop" id="drop">
        <input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Choose image">
        <div>${a.image ? `<img id="dropImg" src="${esc(a.image)}" alt="">` : `<img id="dropImg" alt="" hidden>`}
          <p class="drop-text">${a.image ? "Click or drop to replace the image" : "Click or drop an image here"}</p>
          <small class="muted">PNG, JPEG, WebP or GIF · up to 30 MB</small></div>
      </div>
      <div class="grid2">
        <label class="f"><span>Title</span><input name="title" value="${esc(a.title)}" required maxlength="140"></label>
        <label class="f"><span>Year or date (optional)</span><input name="year" value="${esc(a.year)}" maxlength="20" placeholder="e.g. 2026"></label>
      </div>
      <div class="grid2">
        <label class="f"><span>Category</span><input name="category" list="catList" value="${esc(a.category)}" placeholder="Pick or type a new one">
          <datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
        <label class="f"><span>Tags</span><input name="tags" value="${esc(a.tags.join(", "))}" placeholder="jester, rose, melancholy"><small>Separate with commas.</small></label>
      </div>
      <label class="f"><span>Description or personal notes</span><textarea name="description" maxlength="8000">${esc(a.description)}</textarea></label>
      <label class="f"><span>Image description for screen readers (optional)</span><input name="alt" value="${esc(a.alt)}" maxlength="400" placeholder="What can be seen in the piece"></label>

      <fieldset class="f"><legend>External links</legend>
        <div class="links-rep" id="links"></div>
        <div><button class="btn small ghost" type="button" id="addLink">+ Add link</button></div>
      </fieldset>

      ${db.collections.length ? `<fieldset class="f"><legend>Collections</legend><div class="checks">
        ${db.collections.map((c) => `<label class="check"><input type="checkbox" name="col" value="${c.id}" ${inCols.has(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}
      </div></fieldset>` : ""}

      <fieldset class="f"><legend>Presentation</legend>
        <div class="grid2">${["border", "background", "mat", "size", "animation", "caption", "fit", "position"].map((k) => sel(k, a.display[k])).join("")}</div>
      </fieldset>

      <div class="checks">
        <label class="check"><input type="checkbox" name="featured" ${a.featured ? "checked" : ""}> Feature in The Relics</label>
        <label class="check"><input type="checkbox" name="altar" ${existing && db.settings.featuredId === existing.id ? "checked" : ""}> Put on the homepage altar</label>
      </div>

      <div class="sticky-actions">
        <button class="btn" type="submit" data-publish="1">${existing ? (a.published ? "Save changes" : "Save & publish") : "Publish"}</button>
        <button class="btn ghost" type="submit" data-publish="0">${existing && a.published ? "Save as draft (hide)" : "Save as draft"}</button>
        <button class="btn ghost" type="button" id="cancel">Cancel</button>
        ${existing ? `<a class="btn ghost" href="/?preview=1#/art/${existing.id}" target="_blank" rel="noopener">Preview on site</a>` : ""}
      </div>
    </div>

    <div class="preview-pane" aria-label="Live preview">
      <div class="preview-tabs" role="group">
        <button type="button" data-pv="card" aria-pressed="true">Gallery card</button>
        <button type="button" data-pv="grid">Grid view</button>
        <button type="button" data-pv="show">Showcase</button>
      </div>
      <div class="preview-body" id="pv"></div>
      <p class="preview-note">The preview uses the same styles as the public site.</p>
    </div>
  </form>`;

  const form = $("#ed");
  const linkRow = (l = { label: "", url: "" }) => {
    const row = document.createElement("div");
    row.className = "link-row";
    row.innerHTML = `<input aria-label="Link label" placeholder="Label (e.g. Process video)" value="${esc(l.label)}" data-l="label">
      <input aria-label="Link address" placeholder="https://…" value="${esc(l.url)}" data-l="url">
      <button class="icon-btn" type="button" aria-label="Remove link">✕</button>`;
    row.querySelector("button").onclick = () => { row.remove(); changed(); };
    $("#links").appendChild(row);
  };
  a.links.forEach(linkRow);
  $("#addLink").onclick = () => linkRow();
  $("#cancel").onclick = () => { dirty = false; go("relics"); };

  const collect = () => {
    const f = new FormData(form);
    const d = {};
    $$("[data-d]", form).forEach((s) => (d[s.dataset.d] = s.value));
    return {
      title: f.get("title").trim(), year: f.get("year").trim(), category: f.get("category").trim(),
      tags: f.get("tags").split(",").map((t) => t.trim()).filter(Boolean), description: f.get("description"),
      alt: f.get("alt").trim(), featured: !!f.get("featured"), published: a.published,
      links: $$(".link-row", form).map((r) => ({ label: $("[data-l=label]", r).value.trim(), url: $("[data-l=url]", r).value.trim() })).filter((l) => l.url),
      collections: f.getAll("col"), display: d,
    };
  };

  const paint = () => {
    const m = collect();
    const prev = { ...a, ...m, id: a.id, title: m.title || "Untitled Relic",
      image: upload?.url || a.image, thumb: upload?.url || a.thumb || a.image,
      width: upload?.w || a.width, height: upload?.h || a.height };
    const pv = $("#pv");
    if (!prev.image) { pv.innerHTML = `<p class="muted">Choose an image to see the preview.</p>`; return; }
    if (pview === "card") pv.innerHTML = card(prev, { layout: "masonry" });
    else if (pview === "grid") pv.innerHTML = `<div class="preview-grid">${card(prev, { layout: "grid" })}${'<div class="ghost-card"></div>'.repeat(4)}</div>`;
    else pv.innerHTML = `<div class="preview-show"><div class="showcase-stage bg-${prev.display.background} reveal anim-${prev.display.animation}">${frame(prev)}</div>
      <div class="showcase-info">${infoHTML(prev, { showcaseLink: false })}</div></div>`;
    pv.querySelectorAll("a").forEach((x) => x.addEventListener("click", (e) => e.preventDefault()));
    const st = pv.querySelector(".showcase-stage"); if (st) st.style.setProperty("--bg", bgValue(prev));
    requestAnimationFrame(() => pv.querySelectorAll(".reveal").forEach((x) => x.classList.add("shown")));
  };
  const changed = () => { dirty = true; clearTimeout(changed.t); changed.t = setTimeout(paint, 120); };
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  $$("[data-pv]").forEach((b) => b.onclick = () => { pview = b.dataset.pv; $$("[data-pv]").forEach((x) => x.setAttribute("aria-pressed", x === b)); paint(); });

  // image selection
  const drop = $("#drop"), fileIn = $("#file");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.add("over")));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  fileIn.addEventListener("change", async () => {
    const file = fileIn.files[0]; if (!file) return;
    try {
      $(".drop-text", drop).textContent = "Preparing…";
      upload = await prepareImage(file);
      const img = $("#dropImg"); img.src = upload.url; img.hidden = false;
      $(".drop-text", drop).textContent = `${file.name} · ${upload.w}×${upload.h}`;
      const t = form.elements.title;
      if (!t.value) t.value = titleFromFile(file.name);
      changed();
    } catch (e) { toast(e.message, true); $(".drop-text", drop).textContent = "Click or drop an image here"; }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const meta = collect();
    meta.published = e.submitter?.dataset.publish === "1";
    if (!existing && !upload) return toast("Choose an image first.", true);
    if (!meta.title) { form.elements.title.focus(); return toast("Give it a title.", true); }
    const btns = $$(".sticky-actions button", form); btns.forEach((b) => (b.disabled = true));
    try {
      const body = { meta };
      if (upload) { body.image = upload.image; if (upload.thumb) body.thumb = upload.thumb; }
      const r = await attempt(() => existing ? api("PUT", `artworks/${existing.id}`, body) : api("POST", "artworks", body),
        meta.published ? "Saved. It’s in the gallery." : "Saved as a draft.");
      db = r.db;
      const wantAltar = form.elements.altar.checked;
      if (wantAltar !== (db.settings.featuredId === r.id)) {
        db = await api("PUT", "settings", { featuredId: wantAltar ? r.id : "" });
      }
      dirty = false;
      go("relics");
    } catch { btns.forEach((b) => (b.disabled = false)); }
  });

  paint();
}

const titleFromFile = (n) => n.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled Relic";

/** Keep the original file when reasonable; always make a light thumbnail for the gallery. */
async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Please choose a PNG, JPEG, WebP or GIF image.");
  if (file.size > 30 * 1024 * 1024) throw new Error("That image is over 30 MB. Please export a smaller version.");
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That image could not be read.")); i.src = url; });
  const w = img.naturalWidth, h = img.naturalHeight;
  const toData = (max, q) => {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/webp", q);
    return out.startsWith("data:image/webp") ? out : c.toDataURL("image/jpeg", q);
  };
  const readOriginal = () => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  const gif = file.type === "image/gif";
  const keep = gif || (file.size <= 12 * 1024 * 1024 && Math.max(w, h) <= 4200);
  const image = keep ? await readOriginal() : toData(3600, 0.93);
  const thumb = gif || Math.max(w, h) <= 900 ? null : toData(900, 0.86);
  return { image, thumb, url, w, h };
}

/* ═════════════ collections ═════════════ */
function collections(selId) {
  const cur = db.collections.find((c) => c.id === selId) || null;
  $("#panel").innerHTML = head("Collections", "Group artworks by theme.", `<button class="btn" type="button" id="newCol">+ New collection</button>`) + `
  <div class="split">
    <div class="mini-list">${db.collections.map((c, i) => `
      <div style="display:flex;gap:.3rem"><button type="button" style="flex:1" data-c="${c.id}" aria-current="${c.id === cur?.id}">${esc(c.name)}<small>${c.artworks.length} artworks</small></button>
      <button class="icon-btn" type="button" data-mv="-1" data-i="${i}" aria-label="Move up">↑</button><button class="icon-btn" type="button" data-mv="1" data-i="${i}" aria-label="Move down">↓</button></div>`).join("") || '<p class="muted">No collections yet.</p>'}</div>
    <div id="colEd">${cur || selId === "new" ? "" : '<p class="muted">Choose a collection to edit, or make a new one.</p>'}</div>
  </div>`;
  $("#newCol").onclick = () => collections("new");
  $$("[data-c]").forEach((b) => b.onclick = () => collections(b.dataset.c));
  $$("[data-mv]").forEach((b) => b.onclick = async () => {
    const ids = db.collections.map((c) => c.id), i = +b.dataset.i, j = i + +b.dataset.mv;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    db = await attempt(() => api("POST", "collections/reorder", { ids }));
    collections(selId);
  });
  if (!cur && selId !== "new") return;
  const c = cur || { name: "", description: "", artworks: [], cover: "" };
  const chosen = new Set(c.artworks);
  $("#colEd").innerHTML = `<form class="stack section-card" id="colForm">
    <label class="f"><span>Name</span><input name="name" value="${esc(c.name)}" required></label>
    <label class="f"><span>Description</span><textarea name="description" style="min-height:80px">${esc(c.description)}</textarea></label>
    <div class="f"><span>Artworks in this collection (click to include)</span>
      <div class="picker">${db.artworks.map((a) => `<button type="button" class="pick" data-a="${a.id}" aria-pressed="${chosen.has(a.id)}" title="${esc(a.title)}"><img src="${esc(a.thumb)}" alt="${esc(a.title)}"></button>`).join("")}</div></div>
    <label class="f"><span>Cover image</span><select name="cover" id="coverSel"></select></label>
    <div class="row-actions"><button class="btn" type="submit">Save collection</button>
      ${cur ? '<button class="btn ghost danger" type="button" id="delCol">Delete collection</button>' : ""}</div>
  </form>`;
  const fillCover = () => {
    $("#coverSel").innerHTML = [...chosen].map((id) => `<option value="${id}" ${id === c.cover ? "selected" : ""}>${esc(byId(id)?.title)}</option>`).join("") || "<option value=''>Add artworks first</option>";
  };
  fillCover();
  $$(".pick").forEach((p) => p.onclick = () => {
    chosen.has(p.dataset.a) ? chosen.delete(p.dataset.a) : chosen.add(p.dataset.a);
    p.setAttribute("aria-pressed", chosen.has(p.dataset.a)); fillCover(); dirty = true;
  });
  $("#colForm").addEventListener("input", () => (dirty = true));
  $("#colForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get("name"), description: f.get("description"), artworks: db.artworks.map((a) => a.id).filter((id) => chosen.has(id)), cover: f.get("cover") };
    db = await attempt(() => cur ? api("PUT", `collections/${cur.id}`, body) : api("POST", "collections", body), "Collection saved.");
    dirty = false;
    collections(cur ? cur.id : db.collections[db.collections.length - 1].id);
  };
  if (cur) $("#delCol").onclick = async () => {
    if (!confirm(`Delete the collection “${cur.name}”? The artworks themselves stay in the archive.`)) return;
    db = await attempt(() => api("DELETE", `collections/${cur.id}`), "Collection deleted.");
    dirty = false; collections();
  };
}

/* ═════════════ journal ═════════════ */
function journal(selId) {
  const cur = db.journal.find((j) => j.id === selId) || null;
  $("#panel").innerHTML = head("The Artist’s Journal", "Thoughts, inspiration, stories.", `<button class="btn" type="button" id="newJ">+ New entry</button>`) + `
  <div class="split">
    <div class="mini-list">${db.journal.map((j) => `<button type="button" data-j="${j.id}" aria-current="${j.id === cur?.id}">${esc(j.title)}<small>${esc(j.date)}${j.published ? "" : " · draft"}</small></button>`).join("") || '<p class="muted">No entries yet.</p>'}</div>
    <div id="jEd">${cur || selId === "new" ? "" : '<p class="muted">Choose an entry to edit, or write a new one.</p>'}</div>
  </div>`;
  $("#newJ").onclick = () => journal("new");
  $$("[data-j]").forEach((b) => b.onclick = () => journal(b.dataset.j));
  if (!cur && selId !== "new") return;
  const j = cur || { title: "", body: "", date: new Date().toISOString().slice(0, 10), published: true };
  $("#jEd").innerHTML = `<form class="stack section-card" id="jForm">
    <div class="grid2"><label class="f"><span>Title</span><input name="title" value="${esc(j.title)}" required></label>
    <label class="f"><span>Date</span><input type="date" name="date" value="${esc(j.date)}"></label></div>
    <label class="f"><span>Entry</span><textarea name="body" style="min-height:320px">${esc(j.body)}</textarea><small>Leave a blank line between paragraphs.</small></label>
    <label class="check"><input type="checkbox" name="published" ${j.published ? "checked" : ""}> Published (visible to visitors)</label>
    <div class="row-actions"><button class="btn" type="submit">Save entry</button>
      ${cur ? `<a class="btn ghost" href="/?preview=1#/journal/${cur.id}" target="_blank" rel="noopener">Preview</a><button class="btn ghost danger" type="button" id="delJ">Delete entry</button>` : ""}</div>
  </form>`;
  $("#jForm").addEventListener("input", () => (dirty = true));
  $("#jForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { title: f.get("title"), date: f.get("date"), body: f.get("body"), published: !!f.get("published") };
    db = await attempt(() => cur ? api("PUT", `journal/${cur.id}`, body) : api("POST", "journal", body), "Entry saved.");
    dirty = false;
    journal(cur ? cur.id : db.journal[0].id);
  };
  if (cur) $("#delJ").onclick = async () => {
    if (!confirm(`Delete “${cur.title}” permanently?`)) return;
    db = await attempt(() => api("DELETE", `journal/${cur.id}`), "Entry deleted.");
    dirty = false; journal();
  };
}

/* ═════════════ tags & categories ═════════════ */
function labels() {
  const count = (fn) => db.artworks.reduce((m, a) => { fn(a).forEach((k) => m.set(k, (m.get(k) || 0) + 1)); return m; }, new Map());
  const tags = count((a) => a.tags);
  const cats = count((a) => (a.category ? [a.category] : []));
  (db.settings.categories || []).forEach((c) => cats.has(c) || cats.set(c, 0));
  const table = (kind, map) => `<table class="label-table"><thead><tr><th>Name</th><th>Used</th><th></th></tr></thead><tbody>
    ${[...map].sort((x, y) => x[0].localeCompare(y[0])).map(([k, n]) => `<tr><td><input value="${esc(k)}" data-orig="${esc(k)}" data-kind="${kind}" aria-label="Rename ${esc(k)}"></td><td>${n}</td>
      <td class="row-actions"><button class="btn small" type="button" data-rename>Rename</button><button class="btn small ghost danger" type="button" data-remove>Remove</button></td></tr>`).join("") || `<tr><td colspan="3" class="muted">None yet.</td></tr>`}
    </tbody></table>`;
  $("#panel").innerHTML = head("Tags & categories", "Rename or remove them everywhere at once.") + `
  <div class="grid2" style="align-items:start;gap:2rem">
    <section class="section-card"><h2>Categories</h2>${table("categories", cats)}
      <form id="addCat" class="row-actions" style="margin-top:1rem"><label class="f" style="flex:1"><span class="sr">New category</span><input name="c" placeholder="New category"></label><button class="btn small" type="submit">Add</button></form></section>
    <section class="section-card"><h2>Tags</h2>${table("tags", tags)}</section>
  </div>`;
  const rename = async (input, to) => {
    db = await attempt(() => api("POST", `${input.dataset.kind}/rename`, { from: input.dataset.orig, to }), to ? "Renamed everywhere." : "Removed everywhere.");
    labels();
  };
  $$("[data-rename]").forEach((b) => b.onclick = () => { const i = b.closest("tr").querySelector("input"); if (i.value.trim() && i.value !== i.dataset.orig) rename(i, i.value.trim()); });
  $$("[data-remove]").forEach((b) => b.onclick = () => { const i = b.closest("tr").querySelector("input"); if (confirm(`Remove “${i.dataset.orig}” from every artwork?`)) rename(i, ""); });
  $("#addCat").onsubmit = async (e) => {
    e.preventDefault();
    const c = e.target.c.value.trim(); if (!c) return;
    db = await attempt(() => api("PUT", "settings", { categories: [...(db.settings.categories || []), c] }), "Category added.");
    labels();
  };
}

/* ═════════════ profile & links (keeper + designer) ═════════════ */
function linkRows(container, links) {
  const row = (l = { label: "", url: "" }) => {
    const r = document.createElement("div"); r.className = "link-row";
    r.innerHTML = `<input aria-label="Link label" placeholder="Label (e.g. Twitch)" value="${esc(l.label)}" data-l="label"><input aria-label="Link address" placeholder="https://…" value="${esc(l.url)}" data-l="url"><button class="icon-btn" type="button" aria-label="Remove link">✕</button>`;
    r.querySelector("button").onclick = () => { r.remove(); dirty = true; };
    container.appendChild(r);
  };
  links.forEach(row);
  return { add: () => row(), read: () => $$(".link-row", container).map((r) => ({ label: $("[data-l=label]", r).value.trim(), url: $("[data-l=url]", r).value.trim() })).filter((l) => l.url) };
}

function passwordCard(title, note, who) {
  return `<form class="section-card stack pw-form" data-who="${who || ""}" autocomplete="off">
      <h2>${esc(title)}</h2>${note ? `<p class="muted" style="margin:-.4rem 0 0">${esc(note)}</p>` : ""}
      <div class="grid2"><label class="f"><span>Your current password</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="f"><span>New password (6+ characters)</span><input type="password" name="new" autocomplete="new-password" minlength="6" required></label></div>
      <div><button class="btn" type="submit">Change password</button></div>
    </form>`;
}
function wirePasswords() {
  $$(".pw-form").forEach((form) => form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    await attempt(() => api("POST", "password", { current: f.get("current"), new: f.get("new"), who: form.dataset.who || undefined }), "Password changed.");
    form.reset();
  });
}

/* ═════════════ layout & frames ═════════════ */
function layout() {
  const st = db.settings;
  const sample = db.artworks.find((a) => a.title === "The Weeping Jester") || db.artworks[0];
  const pick = (name, val, cur, label, body) => `<label class="choice"><input type="radio" name="${name}" value="${val}" ${val === cur ? "checked" : ""}>${body || ""}<span>${label}</span></label>`;
  const asDiv = (html) => html.replace(/<button([^>]*)type="button"([^>]*)>/, "<div$1$2>").replace(/<\/button>\s*$/, "</div>");
  const frameCard = (f) => sample ? asDiv(card({ ...sample, display: { ...display(sample), border: f, mat: "none", caption: "hidden", size: "standard", animation: "none" } }, { layout: "masonry" }))
    .replace("reveal", "reveal shown") : "";
  const defFrame = st.defaultFrame || "silver";
  $("#panel").innerHTML = head("Layout & frames", "How the gallery is arranged and how each piece is framed.",
    `<a class="btn ghost" href="/?preview=1" target="_blank" rel="noopener">See it on the site</a>`) + `
  <div class="stack" style="max-width:1100px">
    <form class="section-card stack" id="layForm">
      <h2>Gallery layout</h2>
      <div class="choices">
        ${pick("defaultLayout", "masonry", st.defaultLayout || "masonry", "Masonry", '<i class="lay lay-masonry"></i>')}
        ${pick("defaultLayout", "grid", st.defaultLayout, "Grid", '<i class="lay lay-grid"></i>')}
        ${pick("defaultLayout", "immersive", st.defaultLayout, "Full screen, one at a time", '<i class="lay lay-immersive"></i>')}
      </div>
      <div class="grid2">
        <label class="f"><span>Columns on big screens</span><select name="galleryColumns">
          ${[["auto", "Automatic"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]].map(([v, l]) => `<option value="${v}" ${String(st.galleryColumns || "auto") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f"><span>Space between pieces</span><select name="gallerySpacing">
          ${[["tight", "Tight"], ["normal", "Normal"], ["airy", "Airy"]].map(([v, l]) => `<option value="${v}" ${(st.gallerySpacing || "normal") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <p class="muted" style="margin:0">To move pieces around, drag them in <a href="#" data-go="relics">My artworks</a>. The gallery shows them in that order.</p>
      <div><button class="btn" type="submit">Save layout</button></div>
    </form>

    <section class="section-card stack">
      <h2>Frames</h2>
      <p class="muted" style="margin:0">Pick a frame to see it on your art. Then use it for new uploads, or put it on every piece at once. To frame just one piece, open it in My artworks and click Edit.</p>
      <div class="frame-grid">${OPTS.border.map(([v, l]) => `<label class="frame-swatch"><input type="radio" name="frame" value="${v}" ${v === defFrame ? "checked" : ""}><div class="swatch-art">${frameCard(v)}</div><span>${esc(l)}</span></label>`).join("")}</div>
      <div class="row-actions">
        <button class="btn" type="button" id="frameDefault">Use for new uploads</button>
        <button class="btn ghost" type="button" id="frameAll">Put this frame on every piece</button>
      </div>
    </section>

    <section class="section-card stack">
      <h2>Mats and titles for every piece</h2>
      <div class="grid2">
        <label class="f"><span>Mat (space around the art)</span><select id="allMat">${OPTS.mat.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label class="f"><span>Title on the cards</span><select id="allCaption">${OPTS.caption.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      </div>
      <div><button class="btn ghost" type="button" id="applyAll">Apply to every piece</button></div>
    </section>
  </div>`;
  $$("[data-go]").forEach((a) => a.onclick = (e) => { e.preventDefault(); go(a.dataset.go); });
  $("#layForm").addEventListener("input", () => (dirty = true));
  $("#layForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    db = await attempt(() => api("PUT", "settings", { defaultLayout: f.get("defaultLayout"), galleryColumns: f.get("galleryColumns"), gallerySpacing: f.get("gallerySpacing") }), "Layout saved.");
    dirty = false; layout();
  };
  const chosen = () => $("input[name=frame]:checked")?.value;
  $("#frameDefault").onclick = async () => {
    db = await attempt(() => api("PUT", "settings", { defaultFrame: chosen() }), "New uploads will use this frame.");
    layout();
  };
  $("#frameAll").onclick = async () => {
    const label = OPTS.border.find(([v]) => v === chosen())?.[1];
    if (!confirm(`Put the "${label}" frame on every piece? You can still change single pieces afterwards.`)) return;
    db = await attempt(() => api("POST", "artworks/restyle", { border: chosen() }), "Every piece has the new frame.");
    layout();
  };
  $("#applyAll").onclick = async () => {
    if (!confirm("Change the mat and title style on every piece?")) return;
    db = await attempt(() => api("POST", "artworks/restyle", { mat: $("#allMat").value, caption: $("#allCaption").value }), "Done.");
    layout();
  };
}

/* ═════════════ fonts & text (keeper) ═════════════ */
let fontsLoaded = false;
function loadFontSamples() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const all = [...new Set(Object.values(FONT_LISTS).flat())];
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${all.map((n) => "family=" + n.replace(/ /g, "+")).join("&")}&display=swap`;
  document.head.appendChild(link);
}

function words() {
  loadFontSamples();
  const st = db.settings, look = db.look || DEFAULT_LOOK;
  const fontPick = (k, label, sample) => `
    <fieldset class="f font-pick"><legend>${label}</legend>
      <div class="font-options">${FONT_LISTS[k].map((n) => `
        <label class="font-opt"><input type="radio" name="font-${k}" value="${esc(n)}" ${n === look.fonts[k] ? "checked" : ""}>
          <span class="font-sample" style="font-family:'${esc(n)}',serif">${esc(sample)}</span><small>${esc(n)}</small></label>`).join("")}
      </div></fieldset>`;
  const t = (k, label) => `<label class="f"><span>${label}</span><input data-i="${k}" value="${esc(look.intro[k])}"></label>`;
  $("#panel").innerHTML = head("Fonts & text", "Pick the fonts and change the words visitors see.",
    `<a class="btn ghost" href="/?preview=1" target="_blank" rel="noopener">See it on the site</a>`) + `
  <form class="stack" id="wForm" style="max-width:980px">
    <section class="section-card stack"><h2>Title and tagline</h2>
      <div class="grid2"><label class="f"><span>Site title</span><input name="siteTitle" value="${esc(st.siteTitle)}"></label>
        <label class="f"><span>Tagline under the title</span><input name="tagline" value="${esc(st.tagline)}"></label></div>
    </section>
    <section class="section-card stack"><h2>Fonts</h2>
      ${fontPick("title", "Big title", st.siteTitle || "Briar Chronicles")}
      ${fontPick("head", "Headings and menu", "The Archive")}
      ${fontPick("body", "Descriptions and paragraphs", "A sad jester on a stool.")}
    </section>
    <section class="section-card stack"><h2>Entrance words</h2>
      ${t("beginText", "First line visitors see")}
      ${t("inscription", "Small line above the title")}
      <div class="grid2">${t("button", "Enter button")}${t("hint", "Note under the button (optional)")}</div>
    </section>
    <section class="section-card stack"><h2>Menu names</h2>
      <div class="grid2">${Object.entries(look.nav).map(([k, v]) => `<label class="f"><span>${esc(DEFAULT_LOOK.nav[k])}</span><input data-n="${k}" value="${esc(v)}"></label>`).join("")}</div>
    </section>
    <div class="sticky-actions"><button class="btn" type="submit">Save fonts &amp; text</button>
      <button class="btn ghost" type="button" id="wUndo">Undo changes</button></div>
  </form>`;
  const form = $("#wForm");
  form.addEventListener("input", () => (dirty = true));
  $("#wUndo").onclick = () => { dirty = false; words(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const lookPart = {
      fonts: { title: f.get("font-title"), head: f.get("font-head"), body: f.get("font-body") },
      intro: Object.fromEntries($$("[data-i]", form).map((i) => [i.dataset.i, i.value])),
      nav: Object.fromEntries($$("[data-n]", form).map((i) => [i.dataset.n, i.value])),
    };
    await attempt(async () => {
      db = await api("PUT", "settings", { siteTitle: f.get("siteTitle"), tagline: f.get("tagline") });
      db = await api("PUT", "look", lookPart);
    }, "Saved. Visitors see the new fonts and text now.");
    dirty = false; words();
  };
}

function profile() {
  const st = db.settings;
  $("#panel").innerHTML = head("Profile & links", "Your name, picture and links.") + `
  <div class="stack" style="max-width:900px">
    <form class="section-card stack" id="pForm">
      <h2>About you</h2>
      <label class="f"><span>Artist name</span><input name="artistName" value="${esc(st.artistName)}"></label>
      <label class="f"><span>About (shown in Beyond the Cathedral)</span><textarea name="about">${esc(st.about)}</textarea></label>
      <fieldset class="f"><legend>Twitch profile picture (shown on Beyond the Cathedral, not in the gallery)</legend>
        <div style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap">
          <img id="pfp" src="${esc(st.portraitImage || "")}" alt="" width="84" height="84" style="border-radius:50%;object-fit:cover;background:#000;${st.portraitImage ? "" : "display:none"}">
          <label class="btn small ghost" style="position:relative">Change picture<input type="file" id="pfpFile" accept="image/png,image/jpeg,image/webp,image/gif" style="position:absolute;inset:0;opacity:0;cursor:pointer" aria-label="Choose profile picture"></label>
        </div>
        <div class="grid2" style="margin-top:.8rem">
          <label class="f"><span>Caption</span><input name="portraitCaption" value="${esc(st.portraitCaption || "")}"></label>
          <label class="f"><span>Clicking it opens</span><input name="portraitLink" value="${esc(st.portraitLink || "")}" placeholder="https://www.twitch.tv/…"></label>
        </div>
      </fieldset>
      <fieldset class="f"><legend>Links on Beyond the Cathedral</legend><div class="links-rep" id="sLinks"></div>
        <div><button class="btn small ghost" type="button" id="sAdd">+ Add link</button></div></fieldset>
      <div><button class="btn" type="submit">Save profile</button></div>
    </form>
    ${role === "keeper" ? passwordCard("Change your password", "", "") : ""}
  </div>`;
  const links = linkRows($("#sLinks"), st.links || []);
  $("#sAdd").onclick = links.add;
  let pfp = null;
  $("#pfpFile").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const up = await prepareImage(file);
      pfp = up.thumb || up.image;
      $("#pfp").src = up.url; $("#pfp").style.display = ""; dirty = true;
      toast("Picture ready. Press Save profile.");
    } catch (err) { toast(err.message, true); }
  });
  $("#pForm").addEventListener("input", () => (dirty = true));
  $("#pForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = Object.fromEntries(["artistName", "about", "portraitCaption", "portraitLink"].map((k) => [k, f.get(k)]));
    body.links = links.read();
    if (pfp) body.portraitUpload = pfp;
    db = await attempt(() => api("PUT", "settings", body), "Profile saved.");
    dirty = false; profile();
  };
  wirePasswords();
}

/* ═════════════ site & passwords (designer) ═════════════ */
function site() {
  const st = db.settings;
  const opts = (cur) => `<option value="">None</option>` + db.artworks.map((a) => `<option value="${a.id}" ${a.id === cur ? "selected" : ""}>${esc(a.title)}</option>`).join("");
  $("#panel").innerHTML = head("Site & passwords", "Site title, featured piece and passwords.") + `
  <div class="stack" style="max-width:900px">
    <form class="section-card stack" id="sForm">
      <h2>The archive</h2>
      <label class="f"><span>Site title</span><input name="siteTitle" value="${esc(st.siteTitle)}"></label>
      <label class="f"><span>Tagline on the entrance</span><input name="tagline" value="${esc(st.tagline)}"></label>
      <div class="grid2">
        <label class="f"><span>Homepage altar artwork</span><select name="featuredId">${opts(st.featuredId)}</select></label>
        <label class="f"><span>Default gallery layout</span><select name="defaultLayout">
          ${[["masonry", "Masonry"], ["grid", "Grid"], ["immersive", "Full-screen immersive"]].map(([v, l]) => `<option value="${v}" ${st.defaultLayout === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div><button class="btn" type="submit">Save</button></div>
    </form>
    ${passwordCard("Your designer password", "", "designer")}
    ${passwordCard("The artist’s password", "Sets the password he uses to sign in. Type your own current password to confirm.", "keeper")}
  </div>`;
  $("#sForm").addEventListener("input", () => (dirty = true));
  $("#sForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    db = await attempt(() => api("PUT", "settings", Object.fromEntries(["siteTitle", "tagline", "featuredId", "defaultLayout"].map((k) => [k, f.get(k)]))), "Saved.");
    dirty = false; site();
  };
  wirePasswords();
}

/* ═════════════ appearance (designer) ═════════════ */
const DEFAULT_LOOK = {
  colors: { crimson: "#b3202f", crimsonHot: "#e0384a", blood: "#7e0d1d", burgundy: "#3f0c16", ivory: "#ebe3d1", silver: "#bdb8c2", black: "#07060a", gold: "#d8b878", moon: "#c3192c" },
  glass: ["#d81f35", "#9c1024", "#5a0716", "#1f4fd1", "#6b2bb8", "#e8a23a"],
  fonts: { title: "Cinzel Decorative", head: "Cinzel", body: "Cormorant Garamond" },
  intro: { enabled: true, soundChoice: true, inscription: "ARCHIVVM · RERVM · QVAE · NON · DEBENT · ESSE", button: "Enter the Archive", hint: "", beginText: "Welcome to the archive." },
  effects: { embers: 50, fog: true, watcher: true, moon: true, rays: true, candles: true, parallax: true, sparkles: true },
  nav: { archive: "The Archive", collections: "The Collections", journal: "The Journal", relics: "The Relics", beyond: "Beyond the Cathedral" },
  customCSS: "",
};
const PALETTES = {
  "Crimson cathedral": { crimson: "#b3202f", crimsonHot: "#e0384a", blood: "#7e0d1d", burgundy: "#3f0c16", gold: "#d8b878", moon: "#c3192c" },
  "Frostbitten (ice)": { crimson: "#2f6fd1", crimsonHot: "#6fb2ff", blood: "#173a7a", burgundy: "#0d1b3a", gold: "#cfd8e6", moon: "#3a7bd5" },
  "Amethyst wake": { crimson: "#8e2bd1", crimsonHot: "#c27cff", blood: "#4a1574", burgundy: "#22093a", gold: "#d9c38a", moon: "#9b3fd8" },
  "Old blood & gold": { crimson: "#8c1a1a", crimsonHot: "#c9402e", blood: "#5a0d0d", burgundy: "#2a0707", gold: "#e3c071", moon: "#a6211a" },
};
const GLASS_SETS = {
  "Crimson & sapphire": ["#d81f35", "#9c1024", "#5a0716", "#1f4fd1", "#6b2bb8", "#e8a23a"],
  "All blood": ["#d81f35", "#9c1024", "#5a0716", "#b3202f", "#7a0f2a", "#e8a23a"],
  "Ice & ember": ["#2a7fd8", "#16457f", "#0b1d3a", "#7fd4ff", "#c0203a", "#e8c27a"],
  "Amethyst night": ["#8e2bd1", "#5a1a8f", "#2a0a3f", "#1f4fd1", "#c0305a", "#e8a23a"],
};
const FONT_LISTS = {
  title: ["Cinzel Decorative", "UnifrakturMaguntia", "Grenze Gotisch", "Pirata One", "Cormorant SC", "Cinzel", "Playfair Display SC", "IM Fell English SC"],
  head: ["Cinzel", "Cormorant SC", "Marcellus SC", "Playfair Display SC", "IM Fell English SC"],
  body: ["Cormorant Garamond", "EB Garamond", "Crimson Pro", "Spectral", "Lora", "IM Fell English"],
};
const COLOR_NAMES = { crimson: "Accent (crimson)", crimsonHot: "Bright accent", blood: "Deep accent", burgundy: "Darkest accent", gold: "Gilding (title, buttons)", ivory: "Text", silver: "Secondary text", black: "Background", moon: "The moon" };
const GLASS_NAMES = ["Ruby", "Garnet", "Wine", "Sapphire", "Amethyst", "Amber"];

let lookSaved = null;
function appearance(keep) {
  if (keep !== true || !lookSaved) lookSaved = JSON.stringify(db.look || DEFAULT_LOOK);
  let look = JSON.parse(JSON.stringify(db.look || DEFAULT_LOOK));
  const saved = lookSaved;
  const color = (group, key, label, val) => `<label class="swatch"><input type="color" data-g="${group}" data-k="${key}" value="${val}"><span>${esc(label)}</span></label>`;
  const toggle = (k, label) => `<label class="check"><input type="checkbox" data-e="${k}" ${look.effects[k] ? "checked" : ""}> ${label}</label>`;
  const text = (k, label) => `<label class="f"><span>${label}</span><input data-i="${k}" value="${esc(look.intro[k])}"></label>`;
  $("#panel").innerHTML = head("Appearance", "Change the whole look of the archive. The preview updates as you go; visitors see it when you save.",
    `<button class="btn" type="button" id="lookSave">Save look</button>`) + `
  <div class="look-grid">
    <form class="stack" id="lookForm" onsubmit="return false">
      <section class="section-card stack"><h2>Palette</h2>
        <div class="presets">${Object.keys(PALETTES).map((n) => `<button type="button" class="btn small ghost" data-pal="${esc(n)}">${esc(n)}</button>`).join("")}</div>
        <div class="swatches">${Object.entries(COLOR_NAMES).map(([k, l]) => color("colors", k, l, look.colors[k])).join("")}</div>
      </section>
      <section class="section-card stack"><h2>Stained glass</h2>
        <div class="presets">${Object.keys(GLASS_SETS).map((n) => `<button type="button" class="btn small ghost" data-glass="${esc(n)}">${esc(n)}</button>`).join("")}</div>
        <div class="swatches">${look.glass.slice(0, 6).map((g, i) => color("glass", i, GLASS_NAMES[i], g)).join("")}</div>
      </section>
      <section class="section-card stack"><h2>Typography</h2>
        <div class="grid2">${[["title", "Title"], ["head", "Headings & menus"], ["body", "Body text"]].map(([k, l]) =>
          `<label class="f"><span>${l}</span><select data-font="${k}">${FONT_LISTS[k].map((n) => `<option ${n === look.fonts[k] ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div>
      </section>
      <section class="section-card stack"><h2>The entrance</h2>
        <div class="checks"><label class="check"><input type="checkbox" data-i="enabled" ${look.intro.enabled ? "checked" : ""}> Show the entrance</label>
          <label class="check"><input type="checkbox" data-i="soundChoice" ${look.intro.soundChoice ? "checked" : ""}> Offer “Enter with sound” (bells &amp; organ)</label></div>
        ${text("beginText", "Words before the doors open")}
        ${text("inscription", "Latin inscription above the title")}
        <div class="grid2">${text("button", "Enter button")}${text("hint", "Small note under the button")}</div>
        <p class="muted" style="margin:0">The title and tagline are under <b>Site &amp; passwords</b>.</p>
      </section>
      <section class="section-card stack"><h2>Atmosphere</h2>
        <label class="f"><span>Floating embers: <output id="embOut">${look.effects.embers}</output></span><input type="range" min="0" max="100" data-e="embers" value="${look.effects.embers}"></label>
        <div class="checks">${toggle("fog", "Fog")}${toggle("moon", "Crimson moon")}${toggle("rays", "Light rays &amp; glass sheen")}${toggle("candles", "Candles")}${toggle("watcher", "The watcher (eyes in the dark)")}${toggle("parallax", "Mouse parallax")}${toggle("sparkles", "Tiny sparkles and gems")}</div>
      </section>
      <section class="section-card stack"><h2>Menu names</h2>
        <div class="grid2">${Object.entries(look.nav).map(([k, v]) => `<label class="f"><span>${esc(DEFAULT_LOOK.nav[k])}</span><input data-n="${k}" value="${esc(v)}"></label>`).join("")}</div>
      </section>
      <section class="section-card stack"><h2>Custom CSS</h2>
        <p class="muted" style="margin:0">For anything the controls don’t cover. Applied to the public site after everything else.</p>
        <textarea data-css spellcheck="false" style="font-family:ui-monospace,Consolas,monospace;font-size:.92rem;min-height:180px" placeholder=".intro-title { letter-spacing: .1em; }">${esc(look.customCSS)}</textarea>
      </section>
      <section class="section-card"><h2>Save, share, undo</h2>
        <div class="row-actions">
          <button class="btn small ghost" type="button" id="lookExport">Download this look</button>
          <label class="btn small ghost" style="position:relative">Load a look file<input type="file" id="lookImport" accept="application/json,.json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
          <button class="btn small ghost" type="button" id="lookRevert">Undo unsaved changes</button>
          <button class="btn small ghost danger" type="button" id="lookReset">Reset to original</button>
        </div>
      </section>
    </form>
    <div class="look-preview">
      <div class="row-actions" style="margin-bottom:.6rem">
        <button class="btn small" type="button" id="pvIntro">Replay entrance</button>
        <button class="btn small ghost" type="button" id="pvArchive">Show the archive</button>
        <a class="btn small ghost" href="/?preview=1" target="_blank" rel="noopener">Open full size</a>
      </div>
      <iframe id="lookFrame" src="/?preview=1&embed=1" title="Live preview of the site"></iframe>
    </div>
  </div>`;

  const frameWin = () => $("#lookFrame").contentWindow;
  const push = () => { try { frameWin().postMessage({ type: "briar-look", look }, location.origin); } catch {} };
  $("#lookFrame").addEventListener("load", () => setTimeout(push, 300));
  const form = $("#lookForm");
  const read = () => {
    $$("[data-g=colors]", form).forEach((i) => (look.colors[i.dataset.k] = i.value));
    $$("[data-g=glass]", form).forEach((i) => (look.glass[+i.dataset.k] = i.value));
    $$("[data-font]", form).forEach((s) => (look.fonts[s.dataset.font] = s.value));
    $$("[data-i]", form).forEach((i) => (look.intro[i.dataset.i] = i.type === "checkbox" ? i.checked : i.value));
    $$("[data-e]", form).forEach((i) => (look.effects[i.dataset.e] = i.type === "checkbox" ? i.checked : +i.value));
    $$("[data-n]", form).forEach((i) => (look.nav[i.dataset.n] = i.value));
    look.customCSS = $("[data-css]", form).value;
    $("#embOut").textContent = look.effects.embers;
    dirty = JSON.stringify(look) !== saved;
  };
  let t;
  form.addEventListener("input", () => { read(); clearTimeout(t); t = setTimeout(push, 60); });
  const setAll = (next) => { db.look = next; appearance(true); dirty = JSON.stringify(next) !== lookSaved; };
  $$("[data-pal]").forEach((b) => b.onclick = () => { read(); Object.assign(look.colors, PALETTES[b.dataset.pal]); setAll(look); dirty = true; });
  $$("[data-glass]").forEach((b) => b.onclick = () => { read(); look.glass = [...GLASS_SETS[b.dataset.glass]]; setAll(look); dirty = true; });
  $("#pvIntro").onclick = () => frameWin().postMessage({ type: "briar-replay" }, location.origin);
  $("#pvArchive").onclick = () => frameWin().postMessage({ type: "briar-archive" }, location.origin);
  $("#lookSave").onclick = async () => {
    read();
    db = await attempt(() => api("PUT", "look", look), "The new look is live.");
    dirty = false; appearance();
  };
  $("#lookRevert").onclick = () => { db.look = JSON.parse(lookSaved); dirty = false; appearance(true); };
  $("#lookReset").onclick = () => { if (confirm("Reset every appearance setting to the original look? (Nothing is saved until you press Save look.)")) { setAll(JSON.parse(JSON.stringify(DEFAULT_LOOK))); dirty = true; } };
  $("#lookExport").onclick = () => {
    read();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(look, null, 2)], { type: "application/json" }));
    a.download = "briar-look.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#lookImport").onchange = async (e) => {
    try {
      const next = JSON.parse(await e.target.files[0].text());
      if (!next || typeof next !== "object" || !next.colors) throw new Error();
      setAll({ ...DEFAULT_LOOK, ...next }); dirty = true; toast("Look loaded. Press Save look to publish it.");
    } catch { toast("That file is not a Briar look.", true); }
  };
}

/* ═════════════ start ═════════════ */
(async () => {
  try {
    const me = await (await fetch("/api/me", { credentials: "same-origin" })).json();
    if (me.admin) await load(); else showGate();
  } catch { showGate(); }
})();
