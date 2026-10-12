/**
 * Original generative background music in the style of timbila, the xylophone orchestras of
 * the Chopi people of Inhambane, Mozambique (UNESCO Intangible Cultural Heritage).
 *
 * Nothing here is transcribed from any recording: three synthetic "players" (low, mid and high
 * mbila) improvise interlocking ostinatos over a slowly changing harmonic cycle in an
 * approximately equi-heptatonic tuning (seven ~171-cent steps per octave). Each bar is a
 * wooden tone with inharmonic partials plus the nasal buzz of the gourd resonator's mirliton,
 * emulated with an asymmetric waveshaper and a formant filter. A soft njele rattle keeps the pulse.
 */

const BASE_HZ = 98; // degree 0 of the low mbila
const PULSE = 0.19; // seconds per fast pulse
const CYCLE = 12; // pulses per cycle: divides into 2 x 6 and 3 x 4 for the 3-against-2 feel
const LOOKAHEAD = 0.25; // seconds scheduled ahead of the audio clock
const TICK_MS = 60;

// Harmonic cycles as chord roots in scale degrees (mod 7); each chord lasts one cycle.
const PROGRESSIONS = [
  [0, 4, 2, 5],
  [0, 3, 5, 4],
  [0, 5, 3, 4],
  [2, 6, 4, 0],
  [0, 4, 0, 3],
  [5, 2, 6, 4],
];

// Which players are active in each section (one section = 2 harmonic cycles of 4 chords).
const SECTIONS = [
  { low: 1, mid: 0, high: 0, shaker: 1 },
  { low: 1, mid: 1, high: 0, shaker: 1 },
  { low: 1, mid: 1, high: 1, shaker: 1 },
  { low: 1, mid: 1, high: 1, shaker: 1 },
  { low: 0.6, mid: 1, high: 1, shaker: 0 },
  { low: 1, mid: 1, high: 1, shaker: 1 },
  { low: 1, mid: 0, high: 1, shaker: 1 },
  { low: 1, mid: 1, high: 1, shaker: 1 },
];

const degreeHz = (deg) => BASE_HZ * Math.pow(2, deg / 7);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function buzzCurve() {
  // Asymmetric soft clipping: the membrane slaps on one half of the cycle, giving the nasal
  // even-and-odd harmonic buzz of a mirliton.
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = x >= 0 ? Math.tanh(x * 4) : -0.25 * Math.tanh(-x * 8);
  }
  return curve;
}

function impulse(ctx, seconds = 1.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

/** Random ostinato for one player, as 12 slots of null or { idx, oct, dbl }. */
function makePattern(role) {
  const slots = new Array(CYCLE).fill(null);
  if (role === 'low') {
    // Groups of three pulses (four hits per cycle), root and fifth with occasional octaves.
    const tones = pick([
      [0, 4, 0, 2],
      [0, 0, 4, 2],
      [0, 2, 4, 4],
      [0, 4, 2, 4],
    ]);
    [0, 3, 6, 9].forEach((s, i) => (slots[s] = { idx: tones[i], oct: 0, dbl: i === 0 || Math.random() < 0.25 }));
    if (Math.random() < 0.4) slots[pick([4, 10])] = { idx: pick([0, 4]), oct: 0, dbl: false };
  } else if (role === 'mid') {
    // Off-pulse line that interlocks between the high player's strokes.
    const contour = pick([
      [2, 4, 3, 1, 2, 0],
      [4, 2, 1, 2, 3, 5],
      [0, 2, 4, 2, 1, 3],
      [3, 1, 2, 4, 2, 0],
    ]);
    for (let i = 0; i < 6; i++) {
      if (Math.random() < 0.15) continue;
      slots[i * 2 + 1] = { idx: contour[i], oct: 0, dbl: false };
    }
  } else {
    // On-pulse line, phrased in twos so its accents fall in threes against the bass.
    const contour = pick([
      [4, 3, 2, 3, 4, 6],
      [7, 6, 4, 2, 4, 3],
      [2, 4, 6, 4, 3, 2],
      [6, 4, 3, 4, 2, 0],
    ]);
    for (let i = 0; i < 6; i++) {
      if (i > 0 && Math.random() < 0.2) continue;
      slots[i * 2] = { idx: contour[i], oct: 0, dbl: Math.random() < 0.2 };
    }
  }
  return slots;
}

function mutate(slots, role) {
  const s = Math.floor(Math.random() * CYCLE);
  const allowed = role === 'mid' ? s % 2 === 1 : role === 'high' ? s % 2 === 0 : s % 3 === 0;
  if (!allowed) return;
  if (slots[s] && Math.random() < 0.3 && s !== 0) slots[s] = null;
  else slots[s] = { idx: Math.floor(Math.random() * (role === 'low' ? 5 : 7)), oct: 0, dbl: Math.random() < 0.15 };
}

export class TimbilaMusic {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} output   bus the music is mixed into
   * @param {AudioBuffer} noise  mono white-noise buffer (≥ 0.5 s)
   */
  constructor(ctx, output, noise) {
    this.ctx = ctx;
    this.output = output;
    this.noiseBuffer = noise;
    this.timer = null;
    this.session = null;
  }

  get running() {
    return this.timer !== null;
  }

  start() {
    if (this.running) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5);
    out.connect(this.output);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse ?? (this.impulse = impulse(ctx));
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    reverb.connect(wet).connect(out);

    const curve = buzzCurve();
    const players = {};
    for (const [role, pan] of [
      ['low', 0],
      ['mid', -0.35],
      ['high', 0.35],
    ]) {
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (panner.pan) panner.pan.value = pan;
      panner.connect(out);
      panner.connect(reverb);
      // Mirliton buzz: asymmetric clipping, then a nasal formant band.
      const shaper = ctx.createWaveShaper();
      shaper.curve = curve;
      shaper.oversample = '2x';
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 350;
      const formant = ctx.createBiquadFilter();
      formant.type = 'peaking';
      formant.frequency.value = role === 'low' ? 900 : 1500;
      formant.Q.value = 1.6;
      formant.gain.value = 8;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      const buzzOut = ctx.createGain();
      buzzOut.gain.value = role === 'low' ? 0.16 : 0.11;
      shaper.connect(hp).connect(formant).connect(lp).connect(buzzOut).connect(panner);
      players[role] = { panner, shaper, pattern: makePattern(role), level: 0 };
    }

    const shaker = ctx.createBiquadFilter();
    shaker.type = 'bandpass';
    shaker.frequency.value = 7200;
    shaker.Q.value = 0.8;
    const shakerPan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (shakerPan.pan) shakerPan.pan.value = 0.15;
    shaker.connect(shakerPan).connect(out);

    this.session = { out, reverb, wet, players, shaker, shakerPan };
    this.pulse = 0;
    this.progression = PROGRESSIONS[0];
    this.transpose = 0;
    this.nextTime = ctx.currentTime + 0.15;
    const tick = () => {
      this.schedule();
      this.timer = setTimeout(tick, TICK_MS);
    };
    this.timer = setTimeout(tick, 0);
  }

  /** Fades out over ~0.4 s and releases every node of the session. */
  stop() {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = null;
    const s = this.session;
    this.session = null;
    const t = this.ctx.currentTime;
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setValueAtTime(Math.max(0.0001, s.out.gain.value), t);
    s.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    setTimeout(() => {
      s.out.disconnect();
      s.reverb.disconnect();
      s.wet.disconnect();
      s.shaker.disconnect();
      s.shakerPan.disconnect();
      for (const p of Object.values(s.players)) {
        p.panner.disconnect();
        p.shaper.disconnect();
      }
    }, 900);
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running' || !this.session) return;
    // After a suspension or a throttled background tab, resume from "now" instead of catching up.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playPulse(this.pulse, this.nextTime);
      this.nextTime += PULSE;
      this.pulse++;
    }
  }

  playPulse(n, time) {
    const slot = n % CYCLE;
    const cycle = Math.floor(n / CYCLE);
    const { players } = this.session;
    if (slot === 0) this.onCycle(cycle);
    const section = SECTIONS[Math.floor(cycle / 8) % SECTIONS.length];
    const root = this.progression[cycle % 4] + this.transpose;

    for (const role of ['low', 'mid', 'high']) {
      const p = players[role];
      // Ease players in and out over a couple of cycles rather than switching abruptly.
      if (slot === 0) p.level += (section[role] - p.level) * 0.5;
      if (p.level < 0.05) continue;
      const note = p.pattern[slot];
      if (!note) continue;
      const register = role === 'low' ? 0 : role === 'mid' ? 7 : 14;
      // Pattern values are scale steps above the current chord root.
      let deg = register + (((root % 7) + 7) % 7) + note.idx;
      if (deg > register + 10) deg -= 7;
      let accent;
      if (role === 'low') accent = slot % 6 === 0 ? 1 : 0.72;
      else if (role === 'high') accent = slot % 4 === 0 ? 0.95 : 0.6;
      else accent = 0.68;
      const vel = accent * p.level * (0.88 + Math.random() * 0.2);
      const t = time + (Math.random() - 0.5) * 0.012;
      this.strike(p, deg, vel, t, role);
      if (note.dbl) this.strike(p, deg + (role === 'high' ? -7 : 7), vel * 0.6, t + 0.004, role);
    }

    if (section.shaker) {
      const accent = slot % 3 === 0 ? 1 : slot % 3 === 1 ? 0.45 : 0.6;
      this.rattle(time, accent);
    }
  }

  /** Slow evolution: mutate an ostinato now and then, change the harmonic cycle every few phrases. */
  onCycle(cycle) {
    const { players } = this.session;
    if (cycle > 0 && cycle % 4 === 0) {
      if (Math.random() < 0.35) this.progression = pick(PROGRESSIONS);
      if (Math.random() < 0.15) this.transpose = pick([0, 0, 3, 4]);
    }
    for (const role of ['low', 'mid', 'high']) {
      if (cycle > 0 && cycle % 16 === 0 && Math.random() < 0.6) players[role].pattern = makePattern(role);
      else if (Math.random() < 0.22) mutate(players[role].pattern, role);
    }
  }

  /** One stroke on a wooden bar with gourd resonator and mirliton buzz. */
  strike(player, deg, vel, t, role) {
    const ctx = this.ctx;
    const f = degreeHz(deg) * (1 + (Math.random() - 0.5) * 0.006);
    const decay = Math.min(1.5, Math.max(0.3, 1.1 * Math.pow(220 / f, 0.45)));
    const gain = 0.22 * vel * (role === 'low' ? 1.25 : role === 'high' ? 0.75 : 0.9);
    // Fundamental plus inharmonic wooden-bar partials that die away quickly.
    const partials = [
      [1, 1, decay],
      [3.02, 0.28, decay * 0.22],
      [6.1, 0.1, decay * 0.08],
    ];
    for (const [ratio, amp, dec] of partials) {
      const freq = f * ratio;
      if (freq > 9000) continue;
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      osc.connect(g).connect(player.panner);
      if (ratio === 1) {
        // Drive the buzz chain; the membrane only rattles while the bar rings loudly.
        const drive = ctx.createGain();
        drive.gain.setValueAtTime(0.0001, t);
        drive.gain.exponentialRampToValueAtTime(1.6 * vel, t + 0.006);
        drive.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.55);
        osc.connect(drive).connect(player.shaper);
        osc.onended = () => drive.disconnect();
      }
      osc.start(t);
      osc.stop(t + dec + 0.05);
    }
    // Rubber-headed mallet thump.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(3500, f * 3);
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    src.connect(bp).connect(ng).connect(player.panner);
    src.start(t, Math.random() * 0.3);
    src.stop(t + 0.04);
  }

  /** Njele rattle: two tiny bursts of filtered noise per stroke (forward and back). */
  rattle(t, accent) {
    const ctx = this.ctx;
    for (const [offset, amp] of [
      [0, 1],
      [0.035, 0.5],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const g = ctx.createGain();
      const start = t + offset;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.045 * accent * amp, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      src.connect(g).connect(this.session.shaker);
      src.start(start, Math.random() * 0.4);
      src.stop(start + 0.08);
    }
  }
}
