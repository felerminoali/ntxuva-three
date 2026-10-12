/**
 * DOM user interface: menus, HUD, history, toasts, tutorial panel and end screens.
 * It never touches game rules; it only renders data and forwards user intents.
 */
import { describeRecordText, playerName } from './describe.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'play', 'rules', 'settings', 'about', 'pause', 'end', 'signin', 'online', 'searching', 'store', 'leaderboard'];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.stack = [];
    this.historyOpen = false;

    document.querySelectorAll('[data-nav]').forEach((btn) =>
      btn.addEventListener('click', () => this.push(btn.dataset.nav)),
    );
    document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', () => this.back()));
    document.querySelectorAll('[data-start]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const mode = btn.dataset.start;
        this.h.onStart(mode, {
          difficulty: $('opt-difficulty').value,
          humanSide: Number($('opt-side').value),
        });
      }),
    );
    $('opt-difficulty').addEventListener('change', (e) => this.h.onSettingsChange({ difficulty: e.target.value }));
    $('opt-side').addEventListener('change', (e) => this.h.onSettingsChange({ humanSide: Number(e.target.value) }));
    $('opt-extra').addEventListener('change', (e) => this.h.onSettingsChange({ extraCapture: e.target.checked }));

    const form = $('settings-form');
    form.addEventListener('input', () => this.h.onSettingsChange(this.readSettingsForm()));
    form.addEventListener('change', () => this.h.onSettingsChange(this.readSettingsForm()));

    $('btn-pause').addEventListener('click', () => this.h.onPause());
    $('btn-history').addEventListener('click', () => this.toggleHistory());
    for (const p of [0, 1]) {
      $(`avatar-${p}`).addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlayerInfo(p);
      });
    }
    $('player-pop-close').addEventListener('click', () => this.closePlayerInfo());
    document.addEventListener('pointerdown', (e) => {
      if (this.popPlayer === null || this.popPlayer === undefined) return;
      if (!e.target.closest?.('#player-pop, .tb-avatar')) this.closePlayerInfo();
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.popPlayer !== null && this.popPlayer !== undefined) {
          this.closePlayerInfo();
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true,
    );
    $('btn-undo').addEventListener('click', () => this.h.onUndo());
    $('btn-hint').addEventListener('click', () => this.h.onHint());
    $('btn-skip').addEventListener('click', () => this.h.onSkip());
    $('btn-camera').addEventListener('click', () => this.h.onCamera());

    $('pause-resume').addEventListener('click', () => this.h.onResume());
    $('pause-restart').addEventListener('click', () => this.h.onRestart());
    $('pause-resign').addEventListener('click', () => this.h.onResign());
    $('pause-rules').addEventListener('click', () => this.push('rules'));
    $('pause-settings').addEventListener('click', () => this.push('settings'));
    $('pause-menu').addEventListener('click', () => this.h.onMainMenu());

    $('end-again').addEventListener('click', () => this.h.onRestart());
    $('end-view').addEventListener('click', () => this.h.onViewBoard());
    $('end-menu').addEventListener('click', () => this.h.onMainMenu());

    $('tut-prev').addEventListener('click', () => this.h.onTutorial('prev'));
    $('tut-next').addEventListener('click', () => this.h.onTutorial('next'));
    $('tut-retry').addEventListener('click', () => this.h.onTutorial('retry'));
    $('tut-exit').addEventListener('click', () => this.h.onTutorial('exit'));
  }

  // --- Screen navigation ------------------------------------------------------------

  get current() {
    return this.stack.at(-1) ?? null;
  }

  render() {
    const top = this.current;
    for (const name of SCREENS) $(`screen-${name}`).hidden = name !== top;
    const first = top && $(`screen-${top}`).querySelector('button, select, input');
    first?.focus({ preventScroll: true });
  }

  /** Replaces the whole stack with a single screen (or none). */
  show(name) {
    this.stack = name ? [name] : [];
    this.render();
  }

  push(name) {
    this.stack.push(name);
    this.render();
  }

  back() {
    this.stack.pop();
    if (this.stack.length === 0 && !this.h.inGame()) this.stack.push('menu');
    this.render();
  }

  hideLoading() {
    $('loading').hidden = true;
  }

  // --- Settings -----------------------------------------------------------------------

  setSettingsForm(settings) {
    const form = $('settings-form');
    for (const el of form.elements) {
      if (!el.name || !(el.name in settings)) continue;
      if (el.type === 'checkbox') el.checked = !!settings[el.name];
      else el.value = String(settings[el.name]);
    }
    $('opt-difficulty').value = settings.difficulty;
    $('opt-side').value = String(settings.humanSide);
    $('opt-extra').checked = !!settings.extraCapture;
    $('board-size-note').textContent = `4 × ${settings.columns}`;
  }

  readSettingsForm() {
    const out = {};
    for (const el of $('settings-form').elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'range' || ['animationSpeed', 'columns', 'moveLimit'].includes(el.name)) out[el.name] = Number(el.value);
      else out[el.name] = el.value;
    }
    $('board-size-note').textContent = `4 × ${out.columns}`;
    return out;
  }

  // --- HUD ------------------------------------------------------------------------------

  showHud(visible) {
    $('hud').hidden = !visible;
    if (!visible) {
      $('history-panel').hidden = true;
      this.historyOpen = false;
      this.closePlayerInfo();
      this.lastActive = undefined;
      this.lastCaptured = null;
    }
  }

  /**
   * Renders the top bar.
   * @param {{players: Array<{name:string, initial:string, avatar?:string, badge?:string, seeds:number,
   *   captured:number, tag:string, details:Array<[string,string]>}>, active: number|null,
   *   place: string, round: string}} hud
   */
  setPlayers({ players, active, place, round }) {
    this.hudPlayers = players;
    const total = players[0].seeds + players[1].seeds || 1;
    for (const p of [0, 1]) {
      const info = players[p];
      $(`name-${p}`).textContent = info.name;
      $(`card-${p}`).title = info.name;
      const badge = $(`badge-${p}`);
      badge.hidden = !info.badge;
      badge.textContent = info.badge ?? '';
      $(`seeds-${p}`).textContent = info.seeds;
      this.setFace($(`face-${p}`), info);
      const caps = $(`caps-${p}`);
      if (String(info.captured) !== caps.textContent) {
        caps.textContent = info.captured;
        if (this.lastCaptured && info.captured > this.lastCaptured[p]) this.restartAnimation(caps, 'bump');
      }
      $(`bal-${p}`).style.flexGrow = String(info.seeds / total);
      $(`card-${p}`).classList.toggle('active', active === p);
    }
    this.lastCaptured = players.map((x) => x.captured);
    if (active !== this.lastActive) {
      if (active === 0 || active === 1) this.restartAnimation($(`card-${active}`), 'turn-in');
      this.lastActive = active;
    }
    const vs = $('tb-vs');
    vs.classList.toggle('to-south', active === 0);
    vs.classList.toggle('to-north', active === 1);
    $('tb-place').textContent = place ?? '';
    $('tb-round').textContent = round ?? '';
    if (this.popPlayer !== null && this.popPlayer !== undefined) this.renderPlayerInfo(this.popPlayer);
  }

  /** Live score update while a move is animating (captures land before the move ends). */
  setScores(seeds, captured) {
    if (!this.hudPlayers) return;
    this.setPlayers({
      players: this.hudPlayers.map((p, i) => ({ ...p, seeds: seeds[i], captured: captured[i] })),
      active: this.lastActive,
      place: $('tb-place').textContent,
      round: $('tb-round').textContent,
    });
  }

  setFace(el, info) {
    if (info.avatar) {
      if (el.querySelector('img')?.getAttribute('src') !== info.avatar) {
        const img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.src = info.avatar;
        img.addEventListener('error', () => (el.textContent = info.initial), { once: true });
        el.replaceChildren(img);
      }
    } else if (el.textContent !== info.initial || el.firstElementChild) {
      el.textContent = info.initial;
    }
  }

  restartAnimation(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  togglePlayerInfo(p) {
    if (this.popPlayer === p) this.closePlayerInfo();
    else this.openPlayerInfo(p);
  }

  openPlayerInfo(p) {
    if (!this.hudPlayers) return;
    this.popPlayer = p;
    const pop = $('player-pop');
    pop.classList.toggle('south', p === 0);
    pop.classList.toggle('north', p === 1);
    this.renderPlayerInfo(p);
    pop.hidden = false;
    $(`avatar-${p}`).setAttribute('aria-expanded', 'true');
    this.h.onPlayerInfo?.();
  }

  renderPlayerInfo(p) {
    const info = this.hudPlayers?.[p];
    if (!info) return;
    this.setFace($('pop-avatar'), info);
    $('pop-name').textContent = info.name;
    $('pop-tag').textContent = info.tag ?? '';
    $('pop-stats').replaceChildren(
      ...info.details.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }

  closePlayerInfo() {
    if (this.popPlayer === null || this.popPlayer === undefined) return;
    $(`avatar-${this.popPlayer}`)?.setAttribute('aria-expanded', 'false');
    this.popPlayer = null;
    $('player-pop').hidden = true;
  }

  setTurn(text, thinking = false) {
    const el = $('turn-banner');
    el.textContent = text;
    el.classList.toggle('thinking', thinking);
  }

  setInfo(html) {
    $('info-line').innerHTML = html ?? '';
  }

  setButtons({ undo, hint, skip, undoEnabled = true }) {
    $('btn-undo').hidden = !undo;
    $('btn-undo').disabled = !undoEnabled;
    $('btn-hint').hidden = !hint;
    $('btn-skip').hidden = !skip;
  }

  toggleHistory(force) {
    this.historyOpen = force ?? !this.historyOpen;
    $('history-panel').hidden = !this.historyOpen;
  }

  setHistory(records, columns) {
    const list = $('history-list');
    list.replaceChildren(
      ...records.map((r) => {
        const li = document.createElement('li');
        li.className = r.player === 0 ? 'south' : 'north';
        li.textContent = describeRecordText(r, columns);
        return li;
      }),
    );
    if (records.length === 0) {
      const li = document.createElement('li');
      li.textContent = t('hud.noMoves');
      li.style.listStyle = 'none';
      list.append(li);
    }
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
  }

  toast(message, kind = 'info', ms = 2600) {
    const box = $('toasts');
    while (box.children.length >= 3) box.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = message;
    box.append(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  showEnd(title, detail, { again } = {}) {
    $('end-title').textContent = title;
    $('end-detail').innerHTML = detail;
    $('end-again').textContent = again ?? t('end.playAgain');
    this.show('end');
  }

  /** Online turn clock in the HUD; `null` hides it. */
  setClock(text, { mine = false, urgent = false, fraction = null } = {}) {
    const el = $('turn-clock');
    el.hidden = text === null;
    const bar = $('topbar');
    bar.classList.toggle('timed', text !== null && fraction !== null);
    if (fraction !== null) bar.style.setProperty('--time-left', String(Math.max(0, Math.min(1, fraction))));
    if (text === null) return;
    el.textContent = `⏱ ${text}`;
    el.classList.toggle('mine', mine);
    el.classList.toggle('urgent', urgent && mine);
  }

  /** Online games replace Restart with Resign in the pause menu. */
  setPauseMode(online, active) {
    $('pause-restart').hidden = online;
    $('pause-resign').hidden = !(online && active);
  }

  // --- Tutorial ---------------------------------------------------------------------------

  showTutorial(step, index, total, { done = false, interactive = false } = {}) {
    $('tutorial-panel').hidden = false;
    $('tut-step').textContent = t('tutorial.step', { n: index + 1, total });
    $('tut-title').textContent = step.title;
    $('tut-body').innerHTML = step.body;
    $('tut-done').hidden = !done;
    $('tut-done').innerHTML = done ? `✔ ${step.done ?? t('tutorial.wellDone')}` : '';
    $('tut-prev').disabled = index === 0;
    $('tut-retry').hidden = !interactive;
    $('tut-retry').disabled = !done;
    const next = $('tut-next');
    next.textContent = index === total - 1 ? t('tutorial.finish') : t('tutorial.next');
    next.disabled = interactive && !done;
  }

  hideTutorial() {
    $('tutorial-panel').hidden = true;
  }
}

export function playerLabel(player, mode, humanSide) {
  const side = playerName(player);
  if (mode === 'ai') return t(player === humanSide ? 'player.you' : 'player.computer', { side });
  return side;
}
