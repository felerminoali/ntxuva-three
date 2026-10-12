/**
 * Minimal promise-based tween engine driven by the render loop.
 */
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
};

export class Animator {
  constructor() {
    this.tweens = new Set();
    this.speed = 1;
    this.paused = false;
  }

  /**
   * @param {{duration:number, update:(t:number)=>void, easing?:(t:number)=>number, delay?:number}} opts
   * Duration and delay are in milliseconds (scaled by `speed`).
   */
  tween({ duration, update, easing = ease.inOut, delay = 0 }) {
    return new Promise((resolve) => {
      const tw = { duration: Math.max(1, duration), update, easing, delay, elapsed: 0, resolve };
      if (duration <= 0) {
        update(1);
        resolve();
        return;
      }
      this.tweens.add(tw);
    });
  }

  wait(ms) {
    return this.tween({ duration: ms, update: () => {}, easing: ease.linear });
  }

  update(dtMs) {
    if (this.paused || this.tweens.size === 0) return;
    const step = dtMs * this.speed;
    for (const tw of [...this.tweens]) {
      if (tw.delay > 0) {
        tw.delay -= step;
        if (tw.delay > 0) continue;
      }
      tw.elapsed += step;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.update(tw.easing(t));
      if (t >= 1) {
        this.tweens.delete(tw);
        tw.resolve();
      }
    }
  }

  /** Jumps every running tween to its end state. */
  finishAll() {
    for (const tw of [...this.tweens]) {
      tw.update(tw.easing(1));
      this.tweens.delete(tw);
      tw.resolve();
    }
  }

  get busy() {
    return this.tweens.size > 0;
  }
}
