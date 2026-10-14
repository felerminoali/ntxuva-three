/**
 * Lucky wheel pop-up. It is offered when the game opens (whenever a free spin is ready) and again
 * in the lobby when the player cannot afford any competition, so lost coins can always be won back.
 * Signed-in players spin on the server; everyone else spins with the career on this device.
 */
import { SPIN_SEGMENTS, SPIN_RESCUE_BELOW } from './spin.js';
import { formatCoins } from './tiers.js';
import { onLanguageChange, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const COLORS = ['#b5532d', '#d9a441', '#2f7d5b', '#7a3b1e', '#c4692f', '#e0b54f', '#23395b', '#8e2f2f'];
const SPIN_MS = 4200;

function svg(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export class LuckyWheel {
  constructor({ ui, audio, online, arena, session }) {
    Object.assign(this, { ui, audio, online, arena, session });
    online.wheel = this;
    arena.wheel = this;
    this.rotation = 0;
    this.spinning = false;
    this.buildWheel();
    $('spin-btn').addEventListener('click', () => this.spin());
    $('spin-hub').addEventListener('click', () => this.spin());
    $('spin-close').addEventListener('click', () => this.close());
    $('spin-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        e.stopPropagation();
        this.close();
      }
    }, true);
    onLanguageChange(() => this.isOpen && this.render());
    setInterval(() => {
      if (this.isOpen) this.render();
      this.renderChips();
    }, 30_000);
  }

  get isOpen() {
    return !$('spin-modal').hidden;
  }

  get serverMode() {
    return !!this.online.profile;
  }

  get profile() {
    return this.arena.profile;
  }

  /** Milliseconds until the next free spin (0 when ready). */
  waitMs() {
    const p = this.profile;
    if (!p) return Infinity;
    const offset = this.serverMode ? this.online.net.clockOffset : 0;
    return Math.max(0, (p.spinAt ?? 0) - (Date.now() + offset));
  }

  buildWheel() {
    const rotor = $('spin-rotor');
    const n = SPIN_SEGMENTS.length;
    const step = 360 / n;
    const point = (deg, r) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    };
    SPIN_SEGMENTS.forEach((seg, i) => {
      const a0 = i * step;
      const a1 = a0 + step;
      rotor.append(svg('path', { d: `M0 0 L${point(a0, 92)} A92 92 0 0 1 ${point(a1, 92)} Z`, fill: COLORS[i % COLORS.length], class: seg.coins >= 5_000_000 ? 'jackpot' : '' }));
      const label = svg('text', { x: 0, y: -60, transform: `rotate(${a0 + step / 2})`, class: 'wheel-label' });
      label.textContent = formatCoins(seg.coins);
      rotor.append(label);
    });
    for (let i = 0; i < n; i++) {
      const [x, y] = point(i * step, 92).split(' ');
      rotor.append(svg('circle', { cx: x, cy: y, r: 3, class: 'wheel-stud' }));
    }
  }

  render() {
    const wait = this.waitMs();
    const p = this.profile;
    const broke = p && p.coins < SPIN_RESCUE_BELOW;
    $('spin-sub').textContent = broke ? t('spin.rescue') : t('spin.sub');
    const btn = $('spin-btn');
    btn.disabled = this.spinning || wait > 0;
    $('spin-hub').disabled = btn.disabled;
    if (wait > 0 && !this.spinning) {
      const minutes = Math.ceil(wait / 60_000);
      btn.textContent = t('spin.nextIn', { h: Math.floor(minutes / 60), m: minutes % 60 });
    } else btn.textContent = t('spin.spin');
  }

  /** Updates the lobby chips that open the wheel. */
  renderChips() {
    const wait = this.waitMs();
    for (const id of ['online-bonus', 'arena-bonus']) {
      const btn = $(id);
      const label = $(`${id}-text`);
      if (!btn || !label) continue;
      btn.classList.toggle('ready', wait <= 0);
      if (wait <= 0) label.textContent = t('spin.free');
      else {
        const minutes = Math.ceil(wait / 60_000);
        label.textContent = t('spin.chipIn', { h: Math.floor(minutes / 60), m: minutes % 60 });
      }
    }
  }

  open() {
    this.audio.unlock();
    $('spin-result').textContent = '';
    $('spin-modal').classList.remove('won');
    $('spin-modal').hidden = false;
    this.render();
    $('spin-btn').focus({ preventScroll: true });
  }

  close() {
    if (this.spinning) return;
    $('spin-modal').hidden = true;
  }

  /**
   * Opens the wheel by itself when a spin is ready and the player is not busy in a game.
   * With `rescueOnly`, only when the player cannot afford the cheapest competition.
   */
  maybePrompt({ rescueOnly = false } = {}) {
    if (this.isOpen || this.session.inGame) return false;
    const p = this.profile;
    if (!p || this.waitMs() > 0) return false;
    if (rescueOnly && p.coins >= SPIN_RESCUE_BELOW) return false;
    if (this.ui.current && !['menu', 'arena', 'online'].includes(this.ui.current)) return false;
    this.open();
    return true;
  }

  async spin() {
    if (this.spinning || this.waitMs() > 0) return;
    this.spinning = true;
    this.render();
    let result;
    try {
      if (this.serverMode) {
        result = await this.online.call('spin.play');
        this.online.profile = result.profile;
      } else {
        result = this.arena.career.spin();
      }
    } catch {
      result = null;
    }
    if (!result) {
      this.spinning = false;
      this.render();
      return;
    }
    this.audio.select();
    await this.animateTo(result.segment);
    this.spinning = false;
    $('spin-modal').classList.add('won');
    $('spin-result').textContent = t('spin.won', { coins: result.coins.toLocaleString() });
    this.audio.win();
    this.online.renderMenuBar();
    if (this.online.profile) this.online.renderProfile();
    if (this.ui.current === 'arena') this.arena.render();
    this.renderChips();
    this.render();
  }

  /** Turns the wheel so that segment `index` stops under the pointer at the top. */
  animateTo(index) {
    const rotor = $('spin-rotor');
    const step = 360 / SPIN_SEGMENTS.length;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? 700 : SPIN_MS;
    const jitter = (Math.random() - 0.5) * step * 0.6;
    const target = 360 - (index * step + step / 2) + jitter;
    const current = ((this.rotation % 360) + 360) % 360;
    this.rotation += (reduced ? 360 : 360 * 6) + ((target - current + 360) % 360);
    rotor.style.transition = `transform ${ms}ms cubic-bezier(.15,.8,.2,1)`;
    rotor.style.transform = `rotate(${this.rotation}deg)`;
    let lastTick = -1;
    const start = performance.now();
    const tick = () => {
      if (performance.now() - start > ms) return;
      const angle = new DOMMatrixReadOnly(getComputedStyle(rotor).transform);
      const deg = (Math.atan2(angle.b, angle.a) * 180) / Math.PI;
      const seg = Math.floor((((deg % 360) + 360) % 360) / step);
      if (seg !== lastTick) {
        lastTick = seg;
        this.audio.hover();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return new Promise((resolve) => setTimeout(resolve, ms + 80));
  }
}
