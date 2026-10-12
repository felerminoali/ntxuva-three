/**
 * Game session controller: owns the current game state, turn flow, undo, AI turns,
 * practice previews and the tutorial. It connects the pure rules engine to the 3D view and the UI.
 */
import {
  NORTH,
  SOUTH,
  STATUS,
  actingPlayer,
  applyAction,
  binLabel,
  createGame,
  isPhaseTwo,
  legalMoves,
  previewMove,
  seedsOf,
  validateMove,
} from './gameLogic.js';
import { requestAiAction } from './aiClient.js';
import { playerLabel } from './ui.js';
import { TUTORIAL_COLUMNS, TUTORIAL_STEPS, localizeStep } from './tutorial.js';
import { getLanguage, onLanguageChange, t } from './i18n.js';
import { moveError, playerName, plural } from './describe.js';
import { TIER_BY_ID, formatCoins, levelFor } from './tiers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT_LAYERS = ['legal', 'extra', 'hint', 'preview', 'capture', 'focus', 'hover'];

function tutorialSide(entries, columns) {
  const arr = new Array(columns * 2).fill(0);
  for (const [bin, n] of Object.entries(entries ?? {})) arr[Number(bin)] = n;
  return arr;
}

export class GameSession {
  constructor({ stage, board, pieces, animator, audio, ui, getSettings }) {
    Object.assign(this, { stage, board, pieces, animator, audio, ui, getSettings });
    this.mode = null;
    this.state = null;
    this.history = [];
    this.undoStack = [];
    this.busy = false;
    this.thinking = false;
    this.paused = false;
    this.generation = 0;
    this.humanSide = SOUTH;
    this.difficulty = 'medium';
    this.focus = null;
    this.hovered = null;
    this.tutorialIndex = 0;
    this.tutorialDone = false;
    this.options = {};
    /** Online match data (null when offline). */
    this.online = null;
    /** Hooks set by the online controller: send(action) -> Promise, remaining(deadline) -> ms. */
    this.onlineLink = null;
    this.clockTimer = null;
    onLanguageChange(() => this.onLanguageChange());
  }

  /** Re-renders the language-dependent parts of the HUD and tutorial panel. */
  onLanguageChange() {
    if (!this.mode || !this.state) return;
    this.ui.setHistory(this.history, this.state.columns);
    if (this.mode === 'tutorial') this.showTutorialPanel();
    if (this.busy) this.refreshHud();
    else this.refreshInteraction();
  }

  get settings() {
    return this.getSettings();
  }

  get inGame() {
    return this.mode !== null;
  }

  /** True while an online match is still being played. */
  get onlineActive() {
    return this.mode === 'online' && !!this.online && !this.online.finished;
  }

  isHuman(player) {
    if (this.mode === 'online') return player === this.humanSide;
    return this.mode !== 'ai' || player === this.humanSide;
  }

  name(player) {
    if (this.mode === 'online' && this.online) {
      return player === this.humanSide
        ? `${this.online.selfName} (${t('online.you')})`
        : this.online.opponent.name;
    }
    return playerLabel(player, this.mode, this.humanSide);
  }

  // --- Lifecycle ---------------------------------------------------------------------

  start(mode, options = {}) {
    this.stopOnline();
    this.mode = mode;
    this.options = options;
    this.difficulty = options.difficulty ?? this.settings.difficulty;
    this.humanSide = mode === 'ai' ? (options.humanSide ?? SOUTH) : SOUTH;
    this.paused = false;
    this.animator.paused = false;
    this.ui.show(null);
    this.ui.showHud(true);
    this.stage.controls.autoRotate = false;
    if (mode === 'tutorial') {
      this.tutorialIndex = 0;
      this.loadTutorialStep();
    } else {
      this.ui.hideTutorial();
      const { columns, moveLimit, extraCapture } = this.settings;
      this.loadState(createGame({ columns, moveLimit, extraCapture: !!extraCapture }));
    }
  }

  restart() {
    if (!this.mode || this.mode === 'online') return;
    if (this.mode === 'tutorial') {
      this.ui.show(null);
      this.paused = false;
      this.animator.paused = false;
      this.loadTutorialStep();
      return;
    }
    this.start(this.mode, this.options);
  }

  exitToMenu() {
    this.stopOnline();
    this.generation++;
    this.mode = null;
    this.busy = false;
    this.thinking = false;
    this.paused = false;
    this.animator.paused = false;
    this.pieces.skip();
    this.board.clearLayers();
    this.ui.showHud(false);
    this.ui.hideTutorial();
    this.ui.show('menu');
    this.stage.controls.autoRotate = true;
  }

  /** Loads a fresh position (new game, restart or tutorial step). */
  loadState(state) {
    this.generation++;
    this.busy = false;
    this.thinking = false;
    this.state = state;
    this.history = [];
    this.undoStack = [];
    this.focus = null;
    const firstBuild = !this.board.layout;
    if (firstBuild || this.board.layout.columns !== state.columns) {
      this.board.build(state.columns);
      this.board.setCountsVisible(this.settings.showCounts);
      this.stage.setBoardWidth(this.board.layout.width);
    }
    this.board.clearLayers();
    this.pieces.reset(state);
    this.ui.setHistory([], state.columns);
    this.stage.frame(this.preferredViewSide(), firstBuild);
    this.afterAction();
  }

  preferredViewSide() {
    if (this.mode === 'ai' || this.mode === 'online') return this.humanSide === SOUTH ? 1 : -1;
    if (this.settings.cameraFollow && this.state && this.mode !== 'tutorial') {
      const actor = actingPlayer(this.state) ?? SOUTH;
      return actor === SOUTH ? 1 : -1;
    }
    return 1;
  }

  // --- Turn flow ------------------------------------------------------------------------

  afterAction() {
    this.refreshHud();
    const s = this.state;
    if (s.status === STATUS.OVER) {
      this.refreshInteraction();
      if (this.mode !== 'online') this.onGameOver();
      return;
    }
    if (this.mode === 'tutorial') {
      this.refreshInteraction();
      return;
    }
    const actor = actingPlayer(s);
    if (this.mode === 'online') {
      this.refreshInteraction();
      return;
    }
    if (!this.isHuman(actor)) {
      this.board.clearLayers(TRANSIENT_LAYERS);
      this.runAi();
      return;
    }
    if (this.settings.cameraFollow && this.mode !== 'ai') {
      const side = actor === SOUTH ? 1 : -1;
      if (side !== this.stage.viewSide) this.stage.frame(side);
    }
    this.refreshInteraction();
  }

  /** Bins the human may currently click, as {player, bin} pits. */
  playablePits() {
    const s = this.state;
    if (!s || s.status === STATUS.OVER || this.busy) return [];
    if (this.mode === 'online' && (!this.onlineActive || this.online.queue.length)) return [];
    if (this.mode === 'tutorial') {
      const task = TUTORIAL_STEPS[this.tutorialIndex].task;
      if (!task || this.tutorialDone) return [];
    }
    const actor = actingPlayer(s);
    if (!this.isHuman(actor)) return [];
    if (s.status === STATUS.CHOOSING_EXTRA) {
      return s.pendingCapture.options.map((bin) => ({ player: 1 - actor, bin }));
    }
    let bins = legalMoves(s);
    if (this.mode === 'tutorial') {
      const task = TUTORIAL_STEPS[this.tutorialIndex].task;
      if (task.bins !== 'any') bins = bins.filter((b) => task.bins.includes(b));
    }
    return bins.map((bin) => ({ player: actor, bin }));
  }

  refreshInteraction() {
    this.board.clearLayers(TRANSIENT_LAYERS.filter((l) => l !== 'hover'));
    const s = this.state;
    if (!s) return;
    const pits = this.playablePits();
    if (s.status === STATUS.CHOOSING_EXTRA && pits.length) {
      this.board.setLayer('extra', pits);
      this.ui.setInfo(t('game.chooseExtraInfo'));
    } else {
      const showLegal = this.settings.showHints || this.mode === 'practice' || this.mode === 'tutorial';
      if (showLegal) this.board.setLayer('legal', pits);
      if (this.mode === 'tutorial') {
        const step = TUTORIAL_STEPS[this.tutorialIndex];
        if (step.showOwnSide) {
          const all = [];
          for (let bin = 0; bin < s.columns * 2; bin++) all.push({ player: SOUTH, bin });
          this.board.setLayer('legal', all);
        }
      }
      this.ui.setInfo(this.defaultInfo());
    }
    if (this.focus) this.board.setLayer('focus', [this.focus]);
    this.refreshHud();
  }

  defaultInfo() {
    const s = this.state;
    if (!s || s.status === STATUS.OVER || this.mode === 'tutorial') return '';
    const parts = [];
    const actor = actingPlayer(s);
    if (actor !== null && isPhaseTwo(s, actor)) {
      parts.push(t('game.phaseTwo'));
    }
    if (this.mode === 'practice') parts.push(t('game.hoverPreview'));
    return parts.join(' · ');
  }

  refreshHud() {
    const s = this.state;
    if (!s) return;
    const actor = actingPlayer(s);
    this.ui.setPlayers({
      players: [this.hudPlayer(SOUTH), this.hudPlayer(NORTH)],
      active: s.status === STATUS.OVER || this.online?.finished ? null : actor,
      place: this.hudPlace(),
      round: t('game.turn', { n: s.turn }),
    });
    let text;
    if (s.status === STATUS.OVER || this.online?.finished) text = this.resultTitle();
    else if (this.thinking) text = t('game.thinking', { name: this.name(actor) });
    else if (this.mode === 'tutorial') text = t('game.tutorial');
    else if (this.mode === 'online') {
      if (actor === this.humanSide) text = t('online.yourMove');
      else if (s.status === STATUS.CHOOSING_EXTRA) text = t('online.theirExtra', { name: this.name(actor) });
      else text = t('online.theirMove', { name: this.name(actor) });
    } else if (s.status === STATUS.CHOOSING_EXTRA) text = t('game.chooseExtraTurn', { name: this.name(actor) });
    else if (this.mode === 'ai' && actor === this.humanSide) text = t('game.yourMove');
    else text = t('game.toMove', { name: this.name(actor) });
    this.ui.setTurn(text, this.thinking || (this.mode === 'online' && actor !== this.humanSide && !this.online?.finished));
    const offline = this.mode !== 'tutorial' && this.mode !== 'online';
    this.ui.setButtons({
      undo: offline,
      undoEnabled: this.undoStack.length > 0,
      hint: this.mode === 'practice',
      skip: this.pieces.playing,
    });
  }

  /** Centre label of the top bar: the online room's place, otherwise the game mode. */
  hudPlace() {
    if (this.mode === 'online') return TIER_BY_ID[this.online?.tier]?.place ?? '';
    if (this.mode === 'ai') return t('play.ai');
    if (this.mode === 'local') return t('play.local');
    if (this.mode === 'practice') return t('play.practice');
    if (this.mode === 'tutorial') return t('play.tutorial');
    return '';
  }

  /** Everything the top bar and the player-info popover show about one side. */
  hudPlayer(player) {
    const s = this.state;
    const side = playerName(player);
    const seeds = seedsOf(s, player);
    const details = [
      [t('hud.side'), t(player === SOUTH ? 'hud.sideSouth' : 'hud.sideNorth')],
      [t('hud.seedsOnBoard'), String(seeds)],
      [t('hud.capturedTitle'), String(s.captured[player])],
      [t('hud.bins'), String(s.bins[player].filter((n) => n > 0).length)],
      [t('hud.phase'), t(isPhaseTwo(s, player) ? 'hud.phase2' : 'hud.phase1')],
    ];
    let name = side;
    let badge = null;
    let avatar = null;
    let tag = side;
    if (this.mode === 'online' && this.online) {
      const mine = player === this.humanSide;
      const profile = mine ? this.online.self : this.online.opponent;
      name = (mine ? this.online.selfName : profile?.name) || side;
      avatar = profile?.avatar || null;
      badge = mine ? t('hud.badgeYou') : null;
      tag = mine ? `${t('hud.badgeYou')} · ${side}` : side;
      if (profile) {
        const level = profile.level ?? levelFor(profile);
        details.push([t('hud.level'), String(level)]);
        if (profile.rating !== undefined) details.push([t('hud.rating'), String(profile.rating)]);
        if (profile.games !== undefined) details.push([t('hud.record'), `${profile.wins ?? 0} / ${profile.games}`]);
        if (profile.facebook) details.push([t('hud.facebook'), t('hud.yes')]);
      }
      details.push([t('hud.stake'), `${formatCoins(this.online.stake ?? 0)} ${t('account.coins')}`]);
      details.push([t('hud.extraRule'), t(this.online.extraCapture ? 'hud.ruleExtra' : 'hud.ruleColumn')]);
    } else {
      if (this.mode === 'ai') {
        const human = player === this.humanSide;
        badge = t(human ? 'hud.badgeYou' : 'hud.badgeAi');
        tag = `${badge} · ${side}`;
        if (!human) details.push([t('hud.difficulty'), t(`play.${this.difficulty}`)]);
      }
      details.push([t('hud.extraRule'), t(s.extraCapture ? 'hud.ruleExtra' : 'hud.ruleColumn')]);
    }
    return {
      name,
      initial: (name.trim().charAt(0) || '?').toUpperCase(),
      avatar,
      badge,
      tag,
      seeds,
      captured: s.captured[player],
      details,
    };
  }

  /** Returns an animation event hook that updates the scores the moment seeds are captured. */
  liveScores(before) {
    const seeds = [seedsOf(before, SOUTH), seedsOf(before, NORTH)];
    const captured = [...before.captured];
    return (ev) => {
      if (ev.type !== 'capture') return;
      captured[ev.player] += ev.count;
      seeds[ev.from] -= ev.count;
      this.ui.setScores(seeds, captured);
    };
  }

  // --- Input --------------------------------------------------------------------------------

  handlePick(pit) {
    this.audio.unlock();
    if (!this.mode || this.paused || this.ui.current) return;
    if (this.pieces.playing) {
      this.pieces.skip();
      return;
    }
    if (this.thinking) {
      this.ui.toast(t('game.computerThinking'));
      return;
    }
    if (this.busy || !pit) return;
    this.tryPit(pit);
  }

  tryPit(pit) {
    const s = this.state;
    if (!s || s.status === STATUS.OVER) return;
    if (this.mode === 'tutorial') {
      const task = TUTORIAL_STEPS[this.tutorialIndex].task;
      if (!task) return;
      if (this.tutorialDone) {
        this.ui.toast(t('tutorial.stepComplete'));
        return;
      }
    }
    const actor = actingPlayer(s);
    if (!this.isHuman(actor)) {
      this.reject(pit, this.mode === 'online' ? t('online.notYourTurn') : t('game.waitComputer'));
      return;
    }
    if (s.status === STATUS.CHOOSING_EXTRA) {
      if (pit.player === 1 - actor && s.pendingCapture.options.includes(pit.bin)) {
        this.perform({ type: 'extra', bin: pit.bin });
      } else {
        this.reject(pit, t('game.chooseExtraError'));
      }
      return;
    }
    if (pit.player !== actor) {
      this.reject(pit, t('game.notYourBin', { name: this.name(pit.player) }));
      return;
    }
    const check = validateMove(s, pit.bin);
    if (!check.ok) {
      this.reject(pit, moveError(check));
      return;
    }
    if (this.mode === 'tutorial') {
      const { bins } = TUTORIAL_STEPS[this.tutorialIndex].task;
      if (bins !== 'any' && !bins.includes(pit.bin)) {
        this.reject(pit, t('tutorial.playHighlighted'));
        return;
      }
    }
    this.perform({ type: 'move', bin: pit.bin });
  }

  reject(pit, message) {
    this.board.flash(pit.player, pit.bin, 'invalid');
    this.audio.invalid();
    this.ui.toast(message, 'error');
  }

  handleHover(pit) {
    this.hovered = pit;
    if (!this.mode || this.busy || !this.state) {
      this.board.setLayer('hover', []);
      return;
    }
    const playable = this.playablePits();
    const isPlayable = pit && playable.some((p) => p.player === pit.player && p.bin === pit.bin);
    this.board.setLayer('hover', isPlayable ? [pit] : []);
    if (this.mode === 'practice') this.showPreview(isPlayable ? pit : null);
  }

  showPreview(pit) {
    const s = this.state;
    this.board.setLayer('preview', []);
    this.board.setLayer('capture', []);
    if (!pit || s.status !== STATUS.PLAYING) {
      if (s.status === STATUS.PLAYING) this.ui.setInfo(this.defaultInfo());
      return;
    }
    const p = previewMove(s, pit.bin);
    if (!p.ok) return;
    const r = p.record;
    const opp = 1 - r.player;
    this.board.setLayer('preview', [{ player: r.player, bin: r.lastBin }]);
    this.board.setLayer(
      'capture',
      r.capturedBins.filter((c) => !c.extra).map((c) => ({ player: opp, bin: c.bin })),
    );
    let text = plural('preview.sows', r.sown, { bin: binLabel(s.columns, pit.bin) });
    if (r.laps > 1) text += plural('history.relays', r.laps - 1);
    text += t('preview.ends', { bin: binLabel(s.columns, r.lastBin) });
    const columnCount = r.capturedBins.filter((c) => !c.extra).reduce((a, c) => a + c.count, 0);
    if (columnCount) text += `${t('preview.captures', { n: columnCount })}${s.extraCapture ? t('preview.plusExtra') : ''}`;
    if (r.result?.winner === r.player) text += t('preview.wins');
    this.ui.setInfo(text);
  }

  // --- Performing actions ------------------------------------------------------------------

  async perform(action) {
    if (this.mode === 'online') return this.sendOnline(action);
    const before = this.state;
    const actor = actingPlayer(before);
    const result = applyAction(before, action);
    const gen = this.generation;
    if (this.mode !== 'tutorial') this.undoStack.push({ state: before, historyLength: this.history.length });
    this.busy = true;
    this.focus = null;
    this.board.clearLayers(TRANSIENT_LAYERS);
    if (action.type === 'move') {
      this.audio.select();
      this.board.setLayer('last', [{ player: actor, bin: action.bin }]);
    } else if (!this.isHuman(actor)) {
      const n = before.bins[1 - actor][action.bin];
      this.ui.toast(plural('game.takesExtra', n, { name: this.name(actor), bin: binLabel(before.columns, action.bin) }), 'capture');
    }
    this.refreshHud();
    const scores = this.liveScores(before);
    this.ui.setButtons({ undo: this.mode !== 'tutorial', undoEnabled: false, hint: this.mode === 'practice', skip: true });
    this.ui.setInfo(this.mode === 'tutorial' ? '' : t('game.skipInfo'));

    await this.pieces.play(result.events, result.state, {
      onEvent: (ev) => {
        if (ev.type === 'pickup' && ev.relay) this.board.flash(ev.player, ev.bin, 'preview', 400);
        scores(ev);
      },
    });
    if (gen !== this.generation) return;

    this.state = result.state;
    this.busy = false;
    const record = result.record;
    if (this.state.status === STATUS.CHOOSING_EXTRA) {
      if (this.isHuman(actor)) {
        this.ui.toast(plural('game.capturedChoose', record.captured), 'capture');
      }
    } else {
      this.history.push(record);
      this.ui.setHistory(this.history, this.state.columns);
      this.announce(record);
      if (this.mode === 'tutorial') this.completeTutorialStep();
      else if (this.state.status === STATUS.PLAYING) this.audio.turn();
    }
    this.afterAction();
  }

  announce(record) {
    if (record.loopLimited) this.ui.toast(t('game.loopLimit'));
    if (record.captured) {
      const extra = record.extraLabel ? t('game.includingExtra', { bin: record.extraLabel }) : '';
      this.ui.toast(plural('game.capturedBy', record.captured, { name: this.name(record.player), extra }), 'capture');
    }
  }

  // --- AI -------------------------------------------------------------------------------------

  async runAi() {
    const gen = this.generation;
    this.busy = true;
    this.thinking = true;
    this.refreshHud();
    const started = performance.now();
    let action = null;
    try {
      action = await requestAiAction(this.state, this.difficulty);
    } catch (err) {
      console.error('AI failed', err);
    }
    const remaining = 500 - (performance.now() - started);
    if (remaining > 0) await sleep(remaining);
    while (this.paused && gen === this.generation) await sleep(120);
    if (gen !== this.generation) return;
    this.thinking = false;
    this.busy = false;
    if (!action) {
      this.ui.toast(t('game.aiNoMove'), 'error');
      this.refreshHud();
      return;
    }
    await this.perform(action);
  }

  async hint() {
    if (this.mode !== 'practice' || this.busy || !this.state || this.state.status === STATUS.OVER) return;
    const gen = this.generation;
    const turn = this.state.turn;
    const status = this.state.status;
    this.ui.setInfo(t('game.hintThinking'));
    const action = await requestAiAction(this.state, 'hard');
    if (gen !== this.generation || this.busy || this.state.turn !== turn || this.state.status !== status || !action) return;
    const actor = actingPlayer(this.state);
    const pit = { player: action.type === 'extra' ? 1 - actor : actor, bin: action.bin };
    this.board.setLayer('hint', [pit]);
    this.ui.setInfo(t('game.hintResult', { bin: binLabel(this.state.columns, action.bin) }));
  }

  // --- Undo ------------------------------------------------------------------------------------

  undo() {
    if (!this.mode || this.mode === 'tutorial' || this.mode === 'online' || this.paused) return;
    if (this.busy && !this.thinking) return;
    let index = this.undoStack.length - 1;
    if (this.mode === 'ai') {
      while (index >= 0) {
        const s = this.undoStack[index].state;
        if (s.status === STATUS.PLAYING && this.isHuman(actingPlayer(s))) break;
        index--;
      }
    }
    if (index < 0) {
      this.ui.toast(t('game.nothingToUndo'));
      return;
    }
    const entry = this.undoStack[index];
    this.undoStack.length = index;
    this.generation++;
    this.busy = false;
    this.thinking = false;
    this.state = entry.state;
    this.history.length = entry.historyLength;
    this.ui.setHistory(this.history, this.state.columns);
    this.board.clearLayers();
    this.pieces.sync(this.state, true);
    this.ui.show(null);
    this.audio.select();
    this.afterAction();
  }

  // --- Game over ----------------------------------------------------------------------------

  resultTitle() {
    if (this.mode === 'online' && this.online?.finished) {
      const { winner } = this.online.finished;
      if (winner === null) return t('result.draw');
      return winner === this.humanSide ? t('result.youWin') : t('result.wins', { name: this.online.opponent.name });
    }
    const { winner } = this.state;
    if (winner === null) return t('result.draw');
    if (this.mode === 'ai') return winner === this.humanSide ? t('result.youWin') : t('result.computerWins');
    return t('result.wins', { name: playerName(winner) });
  }

  onGameOver() {
    const s = this.state;
    if (this.mode === 'tutorial') return;
    const winner = s.winner;
    const loser = winner === null ? null : 1 - winner;
    let detail;
    if (s.endReason === 'captured-all') {
      detail = t('end.capturedAll', { winner: this.name(winner), loser: this.name(loser), turns: s.turn });
    } else if (s.endReason === 'no-moves') {
      detail = t('end.noMoves', { loser: this.name(loser) });
    } else {
      detail = t('end.moveLimit', { south: seedsOf(s, SOUTH), north: seedsOf(s, NORTH) });
    }
    detail += `<br>${t('end.captured', { south: s.captured[SOUTH], north: s.captured[NORTH] })}`;
    if (this.mode === 'ai' && winner !== this.humanSide) this.audio.lose();
    else this.audio.win();
    const gen = this.generation;
    setTimeout(() => {
      if (gen === this.generation && !this.paused) this.ui.showEnd(this.resultTitle(), detail);
    }, 900);
  }

  viewBoard() {
    this.ui.show(null);
    this.ui.setInfo(t('game.overInfo'));
  }

  // --- Pause --------------------------------------------------------------------------------

  pause() {
    if (!this.mode || this.ui.current) return;
    this.paused = true;
    // An online game keeps running on the server, so animations continue too.
    this.animator.paused = this.mode !== 'online';
    this.ui.setPauseMode(this.mode === 'online', this.onlineActive);
    this.ui.show('pause');
  }

  resume() {
    this.paused = false;
    this.animator.paused = false;
    this.ui.show(null);
  }

  // --- Keyboard --------------------------------------------------------------------------------

  handleKey(e) {
    const key = e.key;
    if (key === 'Escape') {
      if (this.ui.current === 'pause') this.resume();
      else if (this.ui.current && this.ui.current !== 'menu' && this.ui.current !== 'end') this.ui.back();
      else if (!this.ui.current && this.mode) this.pause();
      return;
    }
    if (this.ui.current || !this.mode) return;
    if (key === ' ' || key === 'Enter') {
      e.preventDefault();
      this.audio.unlock();
      if (this.pieces.playing) this.pieces.skip();
      else if (this.focus) this.handlePick(this.focus);
      return;
    }
    if ((key === 'z' && (e.ctrlKey || e.metaKey)) || key === 'u' || key === 'U') {
      e.preventDefault();
      this.undo();
      return;
    }
    if (key === 'h' || key === 'H') return void this.hint();
    if (key === 'p' || key === 'P') return void this.pause();
    if (key === 's' || key === 'S') return void this.pieces.skip();
    if (key === 'c' || key === 'C') return void this.stage.frame(this.preferredViewSide());
    if (key.startsWith('Arrow')) {
      e.preventDefault();
      this.moveFocus(key);
    }
  }

  moveFocus(key) {
    const s = this.state;
    if (!s || this.busy) return;
    const pits = this.playablePits();
    if (!pits.length) return;
    const actor = actingPlayer(s);
    const view = this.stage.viewSide;
    if (!this.focus) {
      this.focus = pits[0];
    } else if (s.status === STATUS.CHOOSING_EXTRA) {
      const i = pits.findIndex((p) => p.bin === this.focus.bin && p.player === this.focus.player);
      const dir = key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 1;
      this.focus = pits[(i + dir + pits.length) % pits.length];
    } else {
      const { columns } = s;
      const layout = this.board.layout;
      const pos = layout.pitCenter(this.focus.player, this.focus.bin);
      let col = Math.round(pos.x + (columns - 1) / 2);
      let attacking = this.focus.bin >= columns;
      const screenRight = view > 0 ? 1 : -1;
      if (key === 'ArrowLeft') col -= screenRight;
      if (key === 'ArrowRight') col += screenRight;
      // "Up" moves away from the viewer.
      const towardNorth = (key === 'ArrowUp') === view > 0;
      if (key === 'ArrowUp' || key === 'ArrowDown') attacking = actor === SOUTH ? towardNorth : !towardNorth;
      col = Math.max(0, Math.min(columns - 1, col));
      const bin = actor === SOUTH
        ? (attacking ? 2 * columns - 1 - col : col)
        : (attacking ? col + columns : columns - 1 - col);
      this.focus = { player: actor, bin };
    }
    this.board.setLayer('focus', [this.focus]);
    if (this.mode === 'practice') {
      const playable = pits.some((p) => p.bin === this.focus.bin && p.player === this.focus.player);
      this.showPreview(playable ? this.focus : null);
    }
  }

  // --- Online ------------------------------------------------------------------------------------

  /**
   * Starts (or resumes) a server-authoritative match.
   * @param {object} match  `match.start` payload from the server
   * @param {{selfName:string, send:(action)=>Promise, remaining:(deadline)=>number}} link
   */
  startOnline(match, link) {
    this.stopOnline();
    this.mode = 'online';
    this.options = {};
    this.onlineLink = link;
    this.humanSide = match.side;
    this.online = {
      gameId: match.gameId,
      tier: match.tier,
      stake: match.stake,
      extraCapture: match.extraCapture,
      opponent: match.opponent,
      selfName: link.selfName,
      self: link.selfProfile ?? null,
      deadline: match.deadline,
      queue: [],
      draining: false,
      pendingOver: null,
      finished: null,
    };
    this.paused = false;
    this.animator.paused = false;
    this.ui.show(null);
    this.ui.showHud(true);
    this.ui.hideTutorial();
    this.stage.controls.autoRotate = false;
    this.loadState(match.state);
    this.history = [...(match.history ?? [])];
    this.ui.setHistory(this.history, this.state.columns);
    this.clockTimer = setInterval(() => this.tickClock(), 250);
    this.tickClock();
  }

  /** Replaces the local position with the server's after a reconnect. */
  resyncOnline(match) {
    if (this.mode !== 'online' || !this.online || this.online.gameId !== match.gameId) return;
    this.generation++;
    this.pieces.skip();
    this.online.queue.length = 0;
    this.online.draining = false;
    this.online.deadline = match.deadline;
    this.online.opponent = match.opponent;
    this.busy = false;
    this.state = match.state;
    this.history = [...(match.history ?? [])];
    this.ui.setHistory(this.history, this.state.columns);
    this.board.clearLayers();
    this.pieces.sync(this.state, true);
    this.afterAction();
  }

  async sendOnline(action) {
    if (!this.onlineActive || !this.onlineLink) return;
    const actor = actingPlayer(this.state);
    this.busy = true;
    this.board.clearLayers(TRANSIENT_LAYERS);
    if (action.type === 'move') {
      this.audio.select();
      this.board.setLayer('last', [{ player: actor, bin: action.bin }]);
    }
    try {
      await this.onlineLink.send(action);
    } catch (err) {
      if (this.mode !== 'online') return;
      this.busy = false;
      this.ui.toast(this.onlineLink.errorText?.(err) ?? err.message, 'error');
      this.refreshInteraction();
    }
  }

  /** Queues a `game.update` push; updates are animated strictly in order. */
  onlineUpdate(msg) {
    if (this.mode !== 'online' || !this.online || msg.gameId !== this.online.gameId) return;
    this.online.queue.push(msg);
    this.drainOnline();
  }

  async drainOnline() {
    const online = this.online;
    if (!online || online.draining) return;
    online.draining = true;
    const gen = this.generation;
    while (online.queue.length) {
      const msg = online.queue.shift();
      this.busy = true;
      this.board.clearLayers(TRANSIENT_LAYERS);
      const mine = msg.by === this.humanSide;
      if (msg.action.type === 'move') {
        if (!mine) this.audio.select();
        this.board.setLayer('last', [{ player: msg.by, bin: msg.action.bin }]);
      } else if (!mine) {
        const n = this.state.bins[1 - msg.by][msg.action.bin];
        this.ui.toast(plural('game.takesExtra', n, { name: this.name(msg.by), bin: binLabel(this.state.columns, msg.action.bin) }), 'capture');
      }
      if (msg.auto) this.ui.toast(t('online.autoMove'), mine ? 'error' : 'info');
      this.refreshHud();
      const scores = this.liveScores(this.state);
      await this.pieces.play(msg.events, msg.state, {
        onEvent: (ev) => {
          if (ev.type === 'pickup' && ev.relay) this.board.flash(ev.player, ev.bin, 'preview', 400);
          scores(ev);
        },
      });
      if (gen !== this.generation) return;
      this.state = msg.state;
      online.deadline = msg.deadline;
      this.busy = false;
      if (this.state.status === STATUS.CHOOSING_EXTRA) {
        if (mine) this.ui.toast(plural('game.capturedChoose', msg.record.captured), 'capture');
      } else {
        this.history.push(msg.record);
        this.ui.setHistory(this.history, this.state.columns);
        this.announce(msg.record);
        if (this.state.status === STATUS.PLAYING && !online.queue.length) this.audio.turn();
      }
      this.afterAction();
    }
    online.draining = false;
    if (online.pendingOver) this.finishOnline(online.pendingOver);
  }

  /** Handles the server's `game.over` push (after any queued animations). */
  onlineOver(msg) {
    if (this.mode !== 'online' || !this.online || msg.gameId !== this.online.gameId) return;
    this.online.pendingOver = msg;
    if (!this.online.draining) this.finishOnline(msg);
  }

  finishOnline(msg) {
    const online = this.online;
    online.pendingOver = null;
    online.finished = msg;
    this.busy = false;
    clearInterval(this.clockTimer);
    this.clockTimer = null;
    this.ui.setClock(null);
    this.board.clearLayers(TRANSIENT_LAYERS);
    this.refreshHud();
    const won = msg.winner === this.humanSide;
    if (msg.winner !== null && !won) this.audio.lose();
    else this.audio.win();
    let detail = t(`online.reason.${msg.reason}`);
    if (msg.winner === null) detail += `<br>${t('online.drawRefund', { coins: msg.stake.toLocaleString() })}`;
    else if (won) detail += `<br><b class="coin-win">${t('online.won', { coins: msg.payout.toLocaleString() })}</b>`;
    else detail += `<br>${t('online.lost', { coins: msg.stake.toLocaleString() })}`;
    const delta = msg.ratingDelta > 0 ? `+${msg.ratingDelta}` : String(msg.ratingDelta);
    detail += `<br>${t('online.rating', { delta })} · ${t('account.coins')}: ${msg.profile.coins.toLocaleString()}`;
    detail += `<br>${t('end.captured', { south: msg.state.captured[SOUTH], north: msg.state.captured[NORTH] })}`;
    const gen = this.generation;
    setTimeout(() => {
      if (gen === this.generation && this.mode === 'online') {
        this.paused = false;
        this.ui.showEnd(this.resultTitle(), detail, { again: this.onlineLink?.againLabel?.() });
      }
    }, 900);
  }

  tickClock() {
    const online = this.online;
    if (!online || online.finished || !online.deadline || !this.onlineLink) {
      this.ui.setClock(null);
      return;
    }
    const remaining = this.onlineLink.remaining(online.deadline);
    // The turn length is not sent, so the first reading of each new deadline is the full ring.
    if (online.clockFor !== online.deadline) {
      online.clockFor = online.deadline;
      online.clockTotal = Math.max(remaining, 1);
    }
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    const mine = actingPlayer(this.state) === this.humanSide;
    this.ui.setClock(t('online.clock', { s: seconds }), { mine, urgent: seconds <= 10, fraction: remaining / online.clockTotal });
  }

  stopOnline() {
    clearInterval(this.clockTimer);
    this.clockTimer = null;
    this.ui.setClock(null);
    if (this.online) {
      this.online.queue.length = 0;
      this.online = null;
    }
    this.onlineLink = null;
  }

  // --- Tutorial ----------------------------------------------------------------------------------

  loadTutorialStep() {
    const step = TUTORIAL_STEPS[this.tutorialIndex];
    this.tutorialDone = false;
    const columns = TUTORIAL_COLUMNS;
    let state = null;
    if (step.setup === 'initial') state = createGame({ columns });
    else if (step.setup) {
      state = createGame({
        columns,
        extraCapture: !!step.extraCapture,
        bins: [tutorialSide(step.setup.south, columns), tutorialSide(step.setup.north, columns)],
      });
    }
    this.ui.showTutorial(localizeStep(step, getLanguage()), this.tutorialIndex, TUTORIAL_STEPS.length, { interactive: !!step.task });
    if (state) this.loadState(state);
    else if (!this.state || this.state.columns !== columns) this.loadState(createGame({ columns }));
    else {
      this.generation++;
      this.refreshInteraction();
    }
  }

  showTutorialPanel() {
    const step = TUTORIAL_STEPS[this.tutorialIndex];
    this.ui.showTutorial(localizeStep(step, getLanguage()), this.tutorialIndex, TUTORIAL_STEPS.length, {
      done: this.tutorialDone,
      interactive: !!step.task,
    });
  }

  completeTutorialStep() {
    this.tutorialDone = true;
    this.showTutorialPanel();
    this.audio.win();
  }

  tutorialCommand(cmd) {
    if (this.mode !== 'tutorial') return;
    this.audio.unlock();
    if (cmd === 'exit') return this.exitToMenu();
    if (cmd === 'retry') return this.loadTutorialStep();
    if (cmd === 'prev' && this.tutorialIndex > 0) this.tutorialIndex--;
    if (cmd === 'next') {
      if (this.tutorialIndex === TUTORIAL_STEPS.length - 1) {
        this.exitToMenu();
        this.ui.toast(t('tutorial.complete'));
        return;
      }
      this.tutorialIndex++;
    }
    this.loadTutorialStep();
  }
}
