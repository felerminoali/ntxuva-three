/**
 * Sound effects and optional background music, synthesised with the Web Audio API.
 * The music is a looping African background track (public/music), with original generative
 * timbila-style xylophone music (see music.js) as a fallback if the file cannot be played.
 */
import { TimbilaMusic } from './music.js';

// Background track (public/music); the synthesized timbila music is the fallback.
const MUSIC_TRACK_URL = `${import.meta.env?.BASE_URL ?? '/'}music/mysterious-african-music.mp3`;

// Keeps the music subtle under gameplay even at full music volume.
const MUSIC_LEVEL = 0.85;

function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.soundEnabled = true;
    this.musicEnabled = false;
    this.volume = 0.7;
    this.musicVolume = null; // null = half of `volume`
    this.lastDrop = 0;
    this.musicPlayer = null;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      // Sound effects and music have separate volume buses feeding a gentle limiter.
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -6;
      this.master.ratio.value = 4;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.volume;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicGain();
      this.music.connect(this.master);
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicEnabled) this.startMusic();
  }

  /**
   * @param {object} opts
   * @param {boolean} [opts.sound]        sound effects on/off
   * @param {boolean} [opts.music]        background music on/off
   * @param {number}  [opts.volume]       sound-effects volume 0..1
   * @param {?number} [opts.musicVolume]  music volume 0..1; null/omitted = half of `volume`
   */
  configure({ sound, music, volume, musicVolume } = {}) {
    if (sound !== undefined) this.soundEnabled = sound;
    if (volume !== undefined) this.volume = volume;
    if (musicVolume !== undefined) this.musicVolume = musicVolume;
    if (this.ctx && (volume !== undefined || musicVolume !== undefined)) {
      this.sfx.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
      this.music.gain.setTargetAtTime(this.musicGain(), this.ctx.currentTime, 0.05);
    }
    if (music !== undefined) {
      this.musicEnabled = music;
      if (music && this.ctx) this.startMusic();
      if (!music) this.stopMusic();
    }
  }

  musicGain() {
    return (this.musicVolume ?? this.volume * 0.5) * MUSIC_LEVEL;
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  // --- Building blocks ---------------------------------------------------------

  tone(freq, { start = 0, duration = 0.2, type = 'sine', gain = 0.3, bus = this.sfx, attack = 0.005, endFreq } = {}) {
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noise({ start = 0, duration = 0.06, freq = 2000, q = 3, gain = 0.25, bus = this.sfx } = {}) {
    const t = this.ctx.currentTime + start;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(bus);
    src.start(t, Math.random() * 0.4);
    src.stop(t + duration + 0.02);
  }

  /** Marimba/mbira-like pluck. */
  pluck(freq, start = 0, gain = 0.25, bus = this.sfx) {
    this.tone(freq, { start, duration: 0.9, gain, bus, type: 'sine' });
    this.tone(freq * 4, { start, duration: 0.18, gain: gain * 0.25, bus, type: 'sine' });
    this.tone(freq * 2.01, { start, duration: 0.4, gain: gain * 0.15, bus, type: 'triangle' });
  }

  // --- Effects -----------------------------------------------------------------

  play(fn) {
    if (!this.soundEnabled || !this.ready) return;
    fn();
  }

  select() {
    this.play(() => this.tone(880, { duration: 0.08, type: 'triangle', gain: 0.18, endFreq: 620 }));
  }

  hover() {
    this.play(() => this.tone(1400, { duration: 0.03, type: 'sine', gain: 0.04 }));
  }

  /** Seed hitting the wooden bowl. */
  drop() {
    const now = performance.now();
    if (now - this.lastDrop < 35) return;
    this.lastDrop = now;
    this.play(() => {
      const f = 380 + Math.random() * 160;
      this.tone(f, { duration: 0.09, type: 'sine', gain: 0.22, endFreq: f * 0.7 });
      this.noise({ duration: 0.04, freq: 2200 + Math.random() * 900, q: 4, gain: 0.18 });
    });
  }

  pickup(count = 2) {
    this.play(() => {
      const n = Math.min(6, Math.max(2, count));
      for (let i = 0; i < n; i++) {
        this.noise({ start: i * 0.025, duration: 0.035, freq: 2600 + Math.random() * 1500, q: 6, gain: 0.12 });
      }
    });
  }

  capture(count = 1) {
    this.play(() => {
      const n = Math.min(14, 3 + count);
      for (let i = 0; i < n; i++) {
        this.noise({ start: 0.25 + i * 0.03, duration: 0.05, freq: 1800 + Math.random() * 1800, q: 5, gain: 0.14 });
      }
      this.pluck(midiToHz(57), 0, 0.22);
      this.pluck(midiToHz(64), 0.09, 0.2);
    });
  }

  invalid() {
    this.play(() => {
      this.tone(150, { duration: 0.12, type: 'square', gain: 0.07 });
      this.tone(120, { start: 0.13, duration: 0.16, type: 'square', gain: 0.07 });
    });
  }

  turn() {
    this.play(() => this.pluck(midiToHz(69), 0, 0.12));
  }

  win() {
    this.play(() => {
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.pluck(midiToHz(m), i * 0.11, 0.24));
    });
  }

  lose() {
    this.play(() => {
      [67, 64, 60, 55].forEach((m, i) => this.pluck(midiToHz(m), i * 0.18, 0.2));
    });
  }

  // --- Music -------------------------------------------------------------------

  /**
   * Starts the background track (only if music is enabled and audio is unlocked). It streams
   * through the music volume bus; if the file cannot be played, the generative timbila music is used.
   */
  startMusic() {
    if (!this.ctx || !this.musicEnabled) return;
    if (this.trackFailed) {
      this.musicPlayer ??= new TimbilaMusic(this.ctx, this.music, this.noiseBuffer);
      this.musicPlayer.start();
      return;
    }
    if (!this.track) {
      const track = new Audio(MUSIC_TRACK_URL);
      track.loop = true;
      track.preload = 'auto';
      track.addEventListener('error', () => this.useFallbackMusic(), { once: true });
      this.ctx.createMediaElementSource(track).connect(this.music);
      this.track = track;
    }
    this.track.play().catch((err) => {
      // NotAllowedError only means the browser still wants a user gesture: unlock() retries.
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') this.useFallbackMusic();
    });
  }

  useFallbackMusic() {
    if (this.trackFailed) return;
    this.trackFailed = true;
    this.track?.pause();
    if (this.musicEnabled) this.startMusic();
  }

  stopMusic() {
    this.track?.pause();
    this.musicPlayer?.stop();
  }
}
