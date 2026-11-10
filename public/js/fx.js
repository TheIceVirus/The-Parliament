// Atmosphere: the cathedral, the sky, embers, parallax, the watcher, and the ambient choir.

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─────────── cathedral silhouette ─────────── */
function lancet(x, yb, w, h, cls = "glass") {
  const ys = yb - h + w * 0.9, apex = yb - h;
  return `<path class="${cls}" d="M${x},${yb} V${ys} Q${x},${ys - w * 0.55} ${x + w / 2},${apex} Q${x + w},${ys - w * 0.55} ${x + w},${ys} V${yb} Z"/>`;
}
function pinnacle(x, y, w, h) {
  return `<path d="M${x},${y} L${x + w / 2},${y - h} L${x + w},${y} Z"/>`;
}
function spire(cx, baseY, w, apexY) {
  return `<path d="M${cx - w / 2},${baseY} L${cx},${apexY} L${cx + w / 2},${baseY} Z"/>
          <path d="M${cx},${apexY} V${apexY - 26} M${cx - 9},${apexY - 16} H${cx + 9}" stroke="#050407" stroke-width="3"/>`;
}

export function buildCathedral(el) {
  const sil = [];
  // distant ruins
  sil.push(`<path d="M0,760 V600 L40,560 L80,600 V540 L110,470 L140,540 V610 L200,585 V760 Z"/>`);
  sil.push(`<path d="M1600,760 V610 L1560,575 L1520,610 V530 L1490,455 L1460,530 V600 L1400,590 V760 Z"/>`);
  // aisles
  sil.push(`<path d="M230,760 V545 L520,470 V760 Z"/>`, `<path d="M1370,760 V545 L1080,470 V760 Z"/>`);
  [230, 330, 430].forEach((x) => sil.push(pinnacle(x - 8, 545 - (x - 230) * 0.26, 16, 70)));
  [1370, 1270, 1170].forEach((x) => sil.push(pinnacle(x - 8, 545 - (1370 - x) * 0.26, 16, 70)));
  // flying buttresses
  sil.push(`<path d="M300,600 Q420,470 520,430" fill="none" stroke="#050407" stroke-width="10"/>`);
  sil.push(`<path d="M1300,600 Q1180,470 1080,430" fill="none" stroke="#050407" stroke-width="10"/>`);
  // towers + spires
  sil.push(`<rect x="515" y="250" width="130" height="510"/>`, `<rect x="955" y="250" width="130" height="510"/>`);
  sil.push(spire(580, 252, 112, 30), spire(1020, 252, 112, 30));
  [[507, 252], [627, 252], [947, 252], [1067, 252]].forEach(([x, y]) => sil.push(pinnacle(x, y, 26, 80)));
  // nave + gable
  sil.push(`<path d="M640,760 V370 L800,215 L960,370 V760 Z"/>`);
  sil.push(`<path d="M800,215 V170 M786,186 H814" stroke="#050407" stroke-width="5"/>`);

  const glass = [];
  // tower windows
  glass.push(lancet(560, 470, 40, 160, "glass b"), lancet(1000, 470, 40, 160, "glass b"));
  glass.push(lancet(548, 690, 26, 120, "glass c"), lancet(586, 690, 26, 120, "glass c"));
  glass.push(lancet(988, 690, 26, 120, "glass c"), lancet(1026, 690, 26, 120, "glass c"));
  // aisle windows
  [265, 345, 425].forEach((x) => glass.push(lancet(x, 700, 28, 100, "glass")));
  [1307, 1227, 1147].forEach((x) => glass.push(lancet(x, 700, 28, 100, "glass")));
  // facade lancets
  glass.push(lancet(668, 735, 34, 170, "glass b"), lancet(898, 735, 34, 170, "glass b"));

  // rose window tracery
  const R = 78, cx = 800, cy = 405;
  let rose = `<circle class="glass" cx="${cx}" cy="${cy}" r="${R}" fill="url(#roseGlass)"/>`;
  let tr = `<circle cx="${cx}" cy="${cy}" r="${R}" stroke-width="7"/><circle cx="${cx}" cy="${cy}" r="20" stroke-width="4"/>`;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, b = a + Math.PI / 12;
    tr += `<line x1="${cx + Math.cos(a) * 20}" y1="${cy + Math.sin(a) * 20}" x2="${cx + Math.cos(a) * R}" y2="${cy + Math.sin(a) * R}" stroke-width="3.5"/>`;
    tr += `<circle cx="${cx + Math.cos(b) * 52}" cy="${cy + Math.sin(b) * 52}" r="13" stroke-width="2.5"/>`;
  }
  const door = `<path class="door" d="M752,760 V640 Q752,598 800,570 Q848,598 848,640 V760 Z" fill="url(#doorGlow)"/>
    <path d="M800,572 V760" stroke="#050407" stroke-width="3"/>`;

  el.innerHTML = `<svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMax meet" role="presentation">
    <defs>
      <radialGradient id="glassG" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#ff5a52"/><stop offset=".45" stop-color="#b3101f"/><stop offset="1" stop-color="#4a0410"/></radialGradient>
      <radialGradient id="roseGlass" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd3a0"/><stop offset=".25" stop-color="#ff4d4a"/><stop offset=".7" stop-color="#a00c1c"/><stop offset="1" stop-color="#3a0209"/></radialGradient>
      <linearGradient id="doorGlow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9a52"/><stop offset=".6" stop-color="#b2271c"/><stop offset="1" stop-color="#3d070c"/></linearGradient>
      <linearGradient id="stoneG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120e14"/><stop offset="1" stop-color="#060408"/></linearGradient>
      <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>
    <g fill="url(#stoneG)" stroke="rgba(120,40,50,.18)" stroke-width="1">${sil.join("")}</g>
    <g fill="#ff2a35" opacity=".55" filter="url(#bloom)">${glass.join("")}<circle cx="${cx}" cy="${cy}" r="${R}"/><path d="M752,760 V640 Q752,598 800,570 Q848,598 848,640 V760 Z" fill="#ff7a3c"/></g>
    <g fill="url(#glassG)" stroke="#050407" stroke-width="3">${glass.join("")}</g>
    ${rose}<g fill="none" stroke="#050407">${tr}</g>
    ${door}
  </svg>`;
}

/* ─────────── stars ─────────── */
export function stars(canvas) {
  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    const c = canvas.getContext("2d");
    c.scale(dpr, dpr);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round((innerWidth * innerHeight) / 5200);
    for (let i = 0; i < n; i++) {
      const x = rnd() * innerWidth, y = rnd() * innerHeight * 0.75, r = rnd() * 1.1 + 0.2;
      c.fillStyle = `rgba(${220 + rnd() * 35},${200 + rnd() * 30},${210 + rnd() * 30},${0.15 + rnd() * 0.55 * (1 - y / innerHeight)})`;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  };
  draw();
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 200); });
}

/* ─────────── embers ─────────── */
export function embers(canvas, amount = 50) {
  if (reduced) return;
  const amt = () => (typeof amount === "function" ? amount() : amount);
  const c = canvas.getContext("2d");
  let W, H, dpr, parts = [];
  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size(); addEventListener("resize", size);
  const count = () => Math.round((innerWidth < 700 ? 22 : 46) * amt() / 50);
  const spawn = (initial) => ({
    x: Math.random() * W, y: initial ? Math.random() * H : H + 20,
    vx: (Math.random() - 0.5) * 0.25, vy: -(0.25 + Math.random() * 0.6),
    r: 0.6 + Math.random() * 1.9, life: 0, max: 600 + Math.random() * 900,
    sway: Math.random() * Math.PI * 2, hue: 8 + Math.random() * 22,
  });
  for (let i = 0; i < count(); i++) parts.push(spawn(true));
  const tick = () => {
    if (!document.hidden) {
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.life++; p.sway += 0.012;
        p.x += p.vx + Math.sin(p.sway) * 0.25; p.y += p.vy;
        const k = Math.min(1, p.life / 80) * Math.max(0, 1 - p.life / p.max);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `hsla(${p.hue},100%,70%,${0.85 * k})`);
        g.addColorStop(0.3, `hsla(${p.hue - 6},100%,50%,${0.35 * k})`);
        g.addColorStop(1, "hsla(0,100%,40%,0)");
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r * 5, 0, 7); c.fill();
      }
      parts = parts.map((p) => (p.life > p.max || p.y < -30 ? spawn(false) : p));
      while (parts.length < count()) parts.push(spawn(false));
      if (parts.length > count()) parts.length = count();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ─────────── parallax + candlelight ─────────── */
export function parallax(light) {
  if (reduced) return;
  const root = document.documentElement;
  let raf = 0, mx = 0, my = 0;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    document.body.classList.add("has-pointer");
    mx = e.clientX; my = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      root.style.setProperty("--px", `${((mx / innerWidth) - 0.5) * 40}px`);
      root.style.setProperty("--py", `${((my / innerHeight) - 0.5) * 24}px`);
      light.style.transform = `translate(${mx}px, ${my}px)`;
    });
  }, { passive: true });
}

/* ─────────── something in the dark ─────────── */
export function watcher(el) {
  if (reduced) return;
  const appear = () => {
    el.style.left = `${4 + Math.random() * 86}%`;
    el.style.top = `${52 + Math.random() * 30}%`;
    el.classList.add("open");
    setTimeout(() => el.classList.remove("open"), 5000 + Math.random() * 3000);
    setTimeout(appear, 38000 + Math.random() * 50000);
  };
  setTimeout(appear, 16000 + Math.random() * 14000);
}

/* ─────────── tiny lights that come and go in the dark ─────────── */
export function glints(containers, enabled = () => true) {
  if (reduced) return;
  const colors = ["var(--gold)", "var(--ivory)", "var(--crimson-hot)", "var(--gold)"];
  const spawn = () => {
    setTimeout(spawn, 500 + Math.random() * 1100);
    if (document.hidden || !enabled()) return;
    const host = containers.find((c) => c.offsetParent !== null);
    if (!host || host.childElementCount > 14) return;
    const g = document.createElement("span");
    g.className = "glint";
    const size = 4 + Math.random() * 7;
    g.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--s:${size.toFixed(1)}px;--c:${colors[Math.floor(Math.random() * colors.length)]};--t:${(2 + Math.random() * 2.5).toFixed(2)}s`;
    host.appendChild(g);
    g.addEventListener("animationend", () => g.remove());
  };
  spawn();
}
