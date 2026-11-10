// The sanctum: the interior seen on the threshold. A great rose window with the crimson moon
// burning behind it, light falling through the glass, candles, dust turning in the beams.

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;
const f = (n) => n.toFixed(1);
const P = (r, a) => [r * Math.cos(a - Math.PI / 2), r * Math.sin(a - Math.PI / 2)];
const pt = (r, a) => P(r, a).map(f).join(",");

function mix(hex, to, amt) {
  const n = parseInt(hex.slice(1), 16), t = to === "w" ? 255 : 0;
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (t - v) * amt));
  return `rgb(${c.join(",")})`;
}

const sector = (r1, r2, a1, a2) =>
  `M${pt(r1, a1)} A${r1},${r1} 0 0 1 ${pt(r1, a2)} L${pt(r2, a2)} A${r2},${r2} 0 0 0 ${pt(r2, a1)} Z`;
const circle = (r, a, rad) => { const [x, y] = P(r, a); return `M${f(x - rad)},${f(y)} a${rad},${rad} 0 1 0 ${rad * 2},0 a${rad},${rad} 0 1 0 ${-rad * 2},0 Z`; };

/** Build the rose window. `glass` is six jewel colours: ruby, garnet, wine, sapphire, amethyst, amber. */
export function buildRose(el, glass) {
  const pieces = [];
  const add = (d, c, r, a, w = 3.2) => pieces.push({ d, c, r, a, w });
  const rnd = mulberry(1337);

  // centre medallion — a sapphire field, a pale diamond burning in it
  add(circle(0, 0, 58), 3, 0, 0, 4);
  add(`M0,-42 L19,0 L0,42 L-19,0 Z`, 6, 4, 0.3, 2.5);
  // ring B — eight petals
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, h = TAU / 16, d = h * 0.62;
    add(sector(62, 152, a - h, a + h), 2, 100, a);
    add(`M${pt(70, a)} C${pt(96, a - d)} ${pt(138, a - d * 0.72)} ${pt(148, a)} C${pt(138, a + d * 0.72)} ${pt(96, a + d)} ${pt(70, a)} Z`, i % 2 ? 1 : 0, 110, a);
    add(circle(124, a, 8), 5, 124, a, 2);
  }
  // ring C — sixteen roundels
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, h = TAU / 32;
    add(sector(152, 212, a - h, a + h), i % 2 ? 4 : 2, 182, a);
    add(circle(182, a, 23), 0, 182, a);
    add(circle(182, a, 10), i % 2 ? 3 : 5, 182, a, 2);
  }
  // ring D — twenty-four lancets, each in two panes with an eye
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, h = TAU / 48, w = h * 0.74;
    add(sector(212, 402, a - h, a + h), 2, 300, a);
    add(`M${pt(224, a - w)} L${pt(300, a - w)} L${pt(300, a + w)} L${pt(224, a + w)} Z`, i % 2 ? 1 : 0, 262, a);
    add(`M${pt(300, a - w)} L${pt(332, a - w)} C${pt(372, a - w)} ${pt(392, a - w * 0.42)} ${pt(398, a)} C${pt(392, a + w * 0.42)} ${pt(372, a + w)} ${pt(332, a + w)} L${pt(300, a + w)} Z`, [3, 0, 4][i % 3], 350, a);
    add(circle(262, a, 7), 5, 262, a, 2);
  }
  // ring E — forty-eight cusps
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, h = TAU / 48;
    add(sector(402, 458, a - h, a + h), i % 2 ? 1 : 2, 430, a);
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + TAU / 96;
    add(circle(430, a, 11.5), i % 2 ? 3 : 0, 430, a, 2);
  }

  const cols = [...glass, "#dfe9ff"];
  const grads = cols.map((c, i) => `<radialGradient id="rg${i}" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="${mix(c, "w", 0.42)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, "b", 0.55)}"/></radialGradient>`).join("");

  const glassPaths = pieces.map((p) => {
    const dist = 500 + rnd() * 900, ang = p.a + (rnd() - 0.5) * 0.6;
    const [tx, ty] = p.r ? P(dist, ang) : [(rnd() - 0.5) * 200, (rnd() - 0.5) * 200];
    const delay = 0.15 + (p.r / 458) * 1.9 + rnd() * 0.35;
    const sd = (p.r / 458) * 0.22 + rnd() * 0.18;
    return `<path class="pc" d="${p.d}" fill="url(#rg${p.c})" stroke-width="${p.w}" style="--d:${delay.toFixed(2)}s;--sd:${sd.toFixed(2)}s;--tx:${f(tx)}px;--ty:${f(ty)}px;--r:${Math.round((rnd() - 0.5) * 140)}deg"/>`;
  }).join("");

  const stoneRings = [60, 152, 212, 402, 458].map((r) => `<circle r="${r}" class="stone-ring"/><circle r="${r}" class="stone-hi"/>`).join("");
  let carvings = "";
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    carvings += `<path d="${circle(482, a, 5.5)}" class="carve"/>`;
  }

  el.innerHTML = `<svg viewBox="-520 -520 1040 1040" aria-hidden="true">
    <defs>${grads}
      <radialGradient id="stoneG"><stop offset=".86" stop-color="#1c1518"/><stop offset=".93" stop-color="#2a2125"/><stop offset="1" stop-color="#0a0708"/></radialGradient>
      <filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="3" seed="7"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.15"/></filter>
      <clipPath id="glassClip"><circle r="458"/></clipPath>
    </defs>
    <g class="backing"><circle r="505" fill="url(#stoneG)"/><circle r="458" fill="#060406"/></g>
    <g class="glass" stroke="#0b0709" stroke-linejoin="round">${glassPaths}</g>
    <rect class="mottle" x="-458" y="-458" width="916" height="916" filter="url(#mottle)" clip-path="url(#glassClip)"/>
    <g class="tracery" fill="none">${stoneRings}</g>
    <g class="carvings">${carvings}</g>
  </svg>`;
}

/** The great arch and pillars framing the view, with ribs and a rim of window-light. */
export function buildArcade(el) {
  const shafts = (x0, dir) => Array.from({ length: 5 }, (_, i) => {
    const x = x0 + dir * (24 + i * 26);
    return `<path d="M${x},1000 V${330 - i * 6}" class="shaft"/>`;
  }).join("");
  el.innerHTML = `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030204" stop-opacity="0"/><stop offset="1" stop-color="#030204"/></linearGradient>
      <linearGradient id="pillarG" x1="0" x2="1"><stop offset="0" stop-color="#020102"/><stop offset=".8" stop-color="#0b0709"/><stop offset="1" stop-color="#1a0d10"/></linearGradient>
      <linearGradient id="pillarG2" x1="1" x2="0"><stop offset="0" stop-color="#020102"/><stop offset=".8" stop-color="#0b0709"/><stop offset="1" stop-color="#1a0d10"/></linearGradient>
    </defs>
    <path fill="#030204" fill-rule="evenodd" d="M0,0 H1600 V1000 H1420 V340 C1420,190 1090,70 800,12 C510,70 180,190 180,340 V1000 H0 Z"/>
    <path class="rim" d="M196,1000 V342 C196,200 520,84 800,30 C1080,84 1404,200 1404,342 V1000"/>
    <path class="rim faint" d="M222,1000 V346 C222,214 530,104 800,54 C1070,104 1378,214 1378,346 V1000"/>
    <rect x="0" y="0" width="180" height="1000" fill="url(#pillarG)"/>
    <rect x="1420" y="0" width="180" height="1000" fill="url(#pillarG2)"/>
    ${shafts(0, 1)}${shafts(1600, -1)}
    <path d="M150,330 h70 l-10,26 h-50 z M1450,330 h-70 l10,26 h50 z" fill="#0d080a"/>
    <path class="rib" d="M180,340 Q520,300 800,12 M1420,340 Q1080,300 800,12"/>
    <rect x="0" y="780" width="1600" height="220" fill="url(#floorG)"/>
    <g fill="#020102">
      <path d="M250,1000 V905 q0,-10 10,-10 h360 q10,0 10,10 V1000 Z"/>
      <path d="M970,1000 V905 q0,-10 10,-10 h360 q10,0 10,10 V1000 Z"/>
      <path d="M200,1000 V950 q0,-8 8,-8 h440 q8,0 8,8 V1000 Z"/>
      <path d="M944,1000 V950 q0,-8 8,-8 h440 q8,0 8,8 V1000 Z"/>
    </g>
  </svg>`;
}

/** Candle stands on each side — real flames are cheap divs. */
export function buildCandles(el) {
  const stand = (side) => {
    const flames = [[0, 0], [-30, 22], [30, 22], [-56, 44], [56, 44]]
      .map(([x, y], i) => `<span class="flame" style="--x:${x}px;--y:${y}px;--f:${(1.7 + i * 0.37).toFixed(2)}s"></span>`).join("");
    return `<div class="stand ${side}"><div class="stand-body"></div>${flames}</div>`;
  };
  el.innerHTML = stand("left") + stand("right");
}

/** God rays falling from the window. */
export function buildRays(el) {
  const beams = [-34, -20, -8, 4, 16, 29, 40];
  el.innerHTML = beams.map((deg, i) =>
    `<span class="beam" style="--rot:${deg}deg;--w:${10 + (i % 3) * 5}vmin;--c:var(--g${i % 3 === 0 ? 3 : i % 2 ? 0 : 1});--fl:${(5 + i * 1.3).toFixed(1)}s"></span>`).join("");
}

/** Dust turning in the light. */
export function motes(canvas) {
  if (reduced) return () => {};
  const c = canvas.getContext("2d");
  let W, H, run = true, parts = [];
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size(); addEventListener("resize", size);
  for (let i = 0; i < 90; i++) parts.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.4, v: 0.00004 + Math.random() * 0.00012, p: Math.random() * TAU });
  const tick = () => {
    if (!run) return;
    c.clearRect(0, 0, W, H);
    for (const m of parts) {
      m.p += 0.004; m.y += m.v * (Math.sin(m.p) * 0.6 + 0.2); m.x += Math.cos(m.p * 0.7) * 0.00008;
      if (m.y > 1.05) m.y = -0.05; if (m.y < -0.05) m.y = 1.05;
      const cx = Math.abs(m.x - 0.5), cone = 0.12 + m.y * 0.35;          // brighter inside the beam
      const a = Math.max(0, 1 - cx / cone) * 0.75 * (0.4 + 0.6 * Math.sin(m.p * 2) ** 2);
      if (a < 0.02) continue;
      c.fillStyle = `rgba(255,${200 + Math.round(40 * Math.sin(m.p))},190,${a})`;
      c.beginPath(); c.arc(m.x * W, m.y * H, m.s, 0, TAU); c.fill();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { run = false; };
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Break the window outward, toward the viewer. */
export function shatterRose(el) {
  if (reduced) return;
  for (const p of el.querySelectorAll(".pc")) {
    const cs = p.style;
    p.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${cs.getPropertyValue("--tx")}, ${cs.getPropertyValue("--ty")}) rotate(${cs.getPropertyValue("--r")}) scale(1.5)`, opacity: 0 },
    ], { duration: 1700, delay: parseFloat(cs.getPropertyValue("--sd")) * 1000, easing: "cubic-bezier(.16,.7,.25,1)", fill: "forwards" });
  }
}
