// Shared rendering for the public archive and the dashboard's live preview.

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const D = { fit: "contain", position: "center", size: "standard", background: "void", border: "silver", animation: "fade", mat: "none", caption: "hover" };
export const display = (a) => ({ ...D, ...(a?.display || {}) });

export function classes(a) {
  const d = display(a);
  return `bg-${d.background} border-${d.border} anim-${d.animation} size-${d.size} mat-${d.mat} cap-${d.caption}`;
}

export function styleVars(a) {
  const d = display(a);
  return `--fit:${d.fit};--pos:${d.position}`;
}

/** A gallery card. `layout` is masonry | grid | immersive. */
export function card(a, { layout = "masonry", draft = false, index = 0 } = {}) {
  const w = a.width || 800, h = a.height || 1000;
  const img = `<img src="${esc(a.thumb || a.image)}" alt="${esc(a.alt || a.title)}" width="${w}" height="${h}" loading="${index < 6 ? "eager" : "lazy"}" decoding="async">`;
  const meta = [a.category, a.year].filter(Boolean).map(esc).join(" · ");
  const btn = `<button class="relic reveal ${classes(a)}" style="${styleVars(a)}" data-id="${esc(a.id)}" type="button" aria-label="Open ${esc(a.title)}">
      ${draft && !a.published ? '<span class="relic-draft">Draft</span>' : ""}
      <span class="relic-img">${img}</span>
      ${layout === "immersive" ? "" : `<span class="relic-cap"><span class="relic-title">${esc(a.title)}</span>${meta ? `<span class="relic-meta">${meta}</span>` : ""}</span>`}
    </button>`;
  if (layout !== "immersive") return btn;
  return `<section class="slide ${classes(a)}" aria-label="${esc(a.title)}">${btn}
      <div class="slide-cap"><span class="relic-title">${esc(a.title)}</span>${meta ? `<span class="relic-meta">${meta}</span>` : ""}</div></section>`;
}

/** The framed artwork used in the viewer and showcase page. */
export function frame(a, { full = true } = {}) {
  const d = display(a);
  return `<div class="frame border-${d.border} mat-${d.mat} bg-${d.background}"><img src="${esc(full ? a.image : a.thumb || a.image)}" alt="${esc(a.alt || a.title)}" width="${a.width || ""}" height="${a.height || ""}" decoding="async"></div>`;
}

export function bgValue(a) {
  const el = document.createElement("div");
  el.className = `bg-${display(a).background}`;
  document.body.appendChild(el);
  const v = getComputedStyle(el).getPropertyValue("--bg");
  el.remove();
  return v.trim();
}

/** Plain text → paragraphs, safely. */
export function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
}

export function infoHTML(a, { collections = [], showcaseLink = true, linkLabel = "View piece", headingTag = "h2", headingId = "" } = {}) {
  const meta = [a.category, a.year].filter(Boolean).map(esc).join(" · ");
  const tags = (a.tags || []).map((t) => `<a class="tag" href="#/archive?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");
  const links = (a.links || []).map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join("");
  const cols = collections.map((c) => `<a class="tag" href="#/collection/${esc(c.id)}">${esc(c.name)}</a>`).join("");
  return `
    <${headingTag}${headingId ? ` id="${headingId}"` : ""}>${esc(a.title)}</${headingTag}>
    ${meta ? `<p class="v-meta">${meta}</p>` : ""}
    ${a.description ? `<div class="v-desc">${esc(a.description)}</div>` : ""}
    ${tags ? `<div class="v-section"><p class="v-label">Tags</p><div class="v-tags">${tags}</div></div>` : ""}
    ${cols ? `<div class="v-section"><p class="v-label">Collections</p><div class="v-tags">${cols}</div></div>` : ""}
    ${links ? `<div class="v-section"><p class="v-label">Links</p><ul class="v-links">${links}</ul></div>` : ""}
    ${showcaseLink ? `<div class="v-section"><a class="btn ghost" href="#/art/${esc(a.id)}">${esc(linkLabel)}</a></div>` : ""}`;
}
