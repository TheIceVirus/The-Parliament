// All sound is synthesized here — no audio files. Nothing plays until a visitor asks for it.

export class Sound {
  constructor() { this.ctx = null; this.ambientOn = false; }

  ensure() {
    if (this.ctx) return this.ctx;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);
    // a nave six seconds deep
    const len = ctx.sampleRate * 6.5, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4) * (i < 900 ? i / 900 : 1);
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.95;
    this.verb.connect(wet).connect(this.out);
    const mk = (dryAmt) => {
      const g = ctx.createGain(), dry = ctx.createGain();
      dry.gain.value = dryAmt;
      g.connect(this.verb); g.connect(dry).connect(this.out);
      return g;
    };
    this.fx = mk(0.3);                 // the prelude, the shattering
    this.amb = mk(0.22); this.amb.gain.value = 0;   // the ambient loop, faded by the toggle
    this.organWave = ctx.createPeriodicWave(
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      new Float32Array([0, 1, 0.62, 0.28, 0.36, 0.1, 0.16, 0.05, 0.12, 0.04]));
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = this.noise.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = last * 3.2; }  // brown noise
    return ctx;
  }

  async resume() { this.ensure(); if (this.ctx.state !== "running") await this.ctx.resume(); }

  env(g, t, peak, a, hold, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  organ(freqs, t, a, hold, r, level, dest) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1600, t + a + 1);
    const g = ctx.createGain(); this.env(g, t, level, a, hold, r);
    lp.connect(g).connect(dest);
    for (const f of freqs) for (const det of [-4, 3]) {
      const o = ctx.createOscillator(); o.setPeriodicWave(this.organWave);
      o.frequency.value = f; o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = 1 / freqs.length;
      o.connect(og).connect(lp); o.start(t); o.stop(t + a + hold + r + 0.1);
    }
  }

  bell(base, t, level, dest) {
    const ctx = this.ctx;
    const partials = [[0.5, 1, 9], [1, 0.8, 7], [1.19, 0.5, 5], [1.56, 0.35, 4], [2, 0.45, 4.5], [2.51, 0.25, 3], [2.66, 0.2, 3], [3.01, 0.15, 2.4], [4.1, 0.1, 1.6]];
    for (const [m, a, dec] of partials) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = base * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * level, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(dest); o.start(t); o.stop(t + dec + 0.1);
    }
    // the clapper strike
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(level * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(bp).connect(ng).connect(dest); n.start(t); n.stop(t + 0.12);
  }

  choir(freqs, t, a, hold, r, level, dest) {
    const ctx = this.ctx, sum = ctx.createGain(); this.env(sum, t, level, a, hold, r);
    sum.connect(dest);
    const formants = [[750, 6, 1], [1150, 7, 0.55], [2700, 9, 0.25]];   // "ah"
    for (const f of freqs) {
      const src = ctx.createOscillator(); src.type = "sawtooth"; src.frequency.value = f;
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5 + Math.random(); vg.gain.value = f * 0.006;
      vib.connect(vg).connect(src.frequency);
      for (const [ff, q, amp] of formants) {
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = ff; bp.Q.value = q;
        const g = ctx.createGain(); g.gain.value = amp / freqs.length;
        src.connect(bp).connect(g).connect(sum);
      }
      src.start(t); vib.start(t); src.stop(t + a + hold + r + 0.1); vib.stop(t + a + hold + r + 0.1);
    }
  }

  room(t, dur, level, dest) {
    const ctx = this.ctx, n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(820, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(420, t + dur);
    const g = ctx.createGain(); this.env(g, t, level, 2.5, dur - 5, 2.5);
    n.connect(lp).connect(g); n.connect(bp).connect(g); g.connect(dest);
    n.start(t); n.stop(t + dur + 0.2);
  }

  /** The dark-church prelude for the threshold: about twelve seconds, then it lets go. */
  async prelude() {
    await this.resume();
    const t = this.ctx.currentTime + 0.08, d = this.fx;
    this.room(t, 13, 0.07, d);
    this.bell(82.4, t + 0.2, 0.55, d);          // E2 — the great bell
    this.organ([73.42, 110, 146.83, 220], t + 1.2, 3.2, 3.4, 4.5, 0.11, d);   // D minor, bare fifths
    this.bell(82.4, t + 4.2, 0.42, d);
    this.choir([293.66, 349.23, 440], t + 3, 3, 3, 4, 0.05, d);
    this.organ([58.27, 116.54, 174.61, 233.08], t + 6.6, 1.8, 1.4, 4.5, 0.08, d); // B-flat, falling away
    this.bell(82.4, t + 8.2, 0.3, d);
  }

  /** Glass giving way, a low boom, one high bell. */
  async shatter() {
    await this.resume();
    const ctx = this.ctx, t = ctx.currentTime + 0.02, d = this.fx;
    for (let i = 0; i < 46; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), st = t + Math.random() * 0.9, dec = 0.25 + Math.random() * 1.1;
      o.type = "sine"; o.frequency.value = 2200 + Math.random() * 5200;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.025, st + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, st + dec);
      o.connect(g).connect(d); o.start(st); o.stop(st + dec + 0.05);
    }
    const boom = ctx.createOscillator(), bg = ctx.createGain();
    boom.frequency.setValueAtTime(64, t); boom.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.5, t + 0.03); bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    boom.connect(bg).connect(d); boom.start(t); boom.stop(t + 2.3);
    this.bell(329.6, t + 0.35, 0.22, d);
    this.choir([293.66, 440, 587.33], t + 0.4, 1.2, 0.8, 3, 0.035, d);
  }

  /* ── the ambient loop behind the archive (header toggle) ── */
  async toggleAmbient() {
    await this.resume();
    const ctx = this.ctx, t = ctx.currentTime;
    this.ambientOn = !this.ambientOn;
    this.amb.gain.cancelScheduledValues(t);
    this.amb.gain.setValueAtTime(this.amb.gain.value, t);
    if (this.ambientOn) {
      this.amb.gain.linearRampToValueAtTime(0.6, t + 4);
      if (!this.drone) {
        this.drone = ctx.createOscillator(); this.drone.frequency.value = 36.71;
        const dg = ctx.createGain(); dg.gain.value = 0.16; this.drone.connect(dg).connect(this.amb); this.drone.start();
      }
      const chords = [[146.83, 174.61, 220.0, 293.66], [116.54, 146.83, 174.61, 233.08], [98.0, 146.83, 196.0, 233.08], [110.0, 164.81, 220.0, 277.18]];
      let i = 0;
      const next = () => {
        const s = ctx.currentTime + 0.05;
        this.organ(chords[i++ % 4], s, 3, 4.5, 3.5, 0.05, this.amb);
        this.choir(chords[(i + 1) % 4].slice(1).map((f) => f * 2), s + 1, 3, 3, 3, 0.012, this.amb);
      };
      next(); this.timer = setInterval(next, 8500);
      const ring = () => { this.bell([293.66, 349.23, 440, 220][Math.floor(Math.random() * 4)], ctx.currentTime + 0.05, 0.08, this.amb); this.bellTimer = setTimeout(ring, 14000 + Math.random() * 16000); };
      this.bellTimer = setTimeout(ring, 6000);
    } else {
      this.amb.gain.linearRampToValueAtTime(0, t + 1.6);
      clearInterval(this.timer); clearTimeout(this.bellTimer);
    }
    return this.ambientOn;
  }
}
