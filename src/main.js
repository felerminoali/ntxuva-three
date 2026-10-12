/**
 * Application entry point: creates the 3D stage, board, pieces, audio, UI and game session,
 * wires input and settings, and runs the render loop.
 */
import './styles.css';
import { Stage } from './scene.js';
import { Board } from './board.js';
import { Pieces } from './pieces.js';
import { Animator } from './animator.js';
import { AudioManager } from './audio.js';
import { InputHandler } from './input.js';
import { UI } from './ui.js';
import { GameSession } from './game.js';
import { createGame } from './gameLogic.js';
import { loadSettings, saveSettings } from './settings.js';
import { OnlineController } from './online.js';
import { applyTranslations, getLanguage, setLanguage } from './i18n.js';

let settings = loadSettings();
if (settings.language) setLanguage(settings.language);
settings.language = getLanguage();
applyTranslations(document);

const stage = new Stage(document.getElementById('stage'));
const animator = new Animator();
const audio = new AudioManager();
const board = new Board(stage.scene);
const pieces = new Pieces(stage.scene, animator, audio);
pieces.setBoard(board);

let session;
let online;
const ui = new UI({
  inGame: () => session.inGame,
  onStart: (mode, opts) => {
    audio.unlock();
    if (mode === 'online') {
      online.open();
      return;
    }
    applySettings({ difficulty: opts.difficulty, humanSide: opts.humanSide });
    session.start(mode, opts);
  },
  onSettingsChange: (changes) => applySettings(changes),
  onPause: () => session.pause(),
  onResume: () => session.resume(),
  onRestart: () => {
    audio.unlock();
    if (session.mode === 'online') online.playAgain();
    else session.restart();
  },
  onResign: async () => {
    if (await online.resign()) session.resume();
  },
  onMainMenu: async () => {
    if (session.mode === 'online') {
      if (!(await online.confirmLeave())) return;
      online.backToLobby();
      return;
    }
    session.exitToMenu();
  },
  onViewBoard: () => session.viewBoard(),
  onUndo: () => session.undo(),
  onHint: () => session.hint(),
  onSkip: () => pieces.skip(),
  onCamera: () => stage.frame(session.preferredViewSide()),
  onTutorial: (cmd) => session.tutorialCommand(cmd),
});

session = new GameSession({ stage, board, pieces, animator, audio, ui, getSettings: () => settings });
online = new OnlineController({
  ui,
  session,
  audio,
  getSettings: () => settings,
  saveSettings: (changes) => applySettings(changes),
});
document.getElementById('btn-online').addEventListener('click', () => {
  audio.unlock();
  online.open();
});

function applySettings(changes = {}, initial = false) {
  const before = settings;
  settings = { ...settings, ...changes };
  if (!initial) saveSettings(settings);
  audio.configure({ sound: settings.sound, music: settings.music, volume: settings.volume });
  if (initial || before.quality !== settings.quality) stage.setQuality(settings.quality);
  if ((initial || before.scenario !== settings.scenario) && typeof stage.setScenario === 'function') {
    stage.setScenario(settings.scenario);
  }
  if (!initial && before.language !== settings.language) {
    setLanguage(settings.language);
    applyTranslations(document);
    if (session.inGame) session.refreshHud();
  }
  animator.speed = settings.animationSpeed;
  board.setCountsVisible(settings.showCounts);
  if (!initial && session.inGame && !session.busy && before.showHints !== settings.showHints) {
    session.refreshInteraction();
  }
}

new InputHandler(
  { canvas: stage.canvas, camera: stage.camera, board },
  {
    onPick: (pit) => session.handlePick(pit),
    onHover: (pit) => session.handleHover(pit),
    onKey: (e) => session.handleKey(e),
  },
);

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });

// Initial backdrop: a fresh board slowly turning behind the main menu.
applySettings({}, true);
ui.setSettingsForm(settings);
const backdrop = createGame({ columns: settings.columns });
board.build(backdrop.columns);
board.setCountsVisible(settings.showCounts);
stage.setBoardWidth(board.layout.width);
pieces.reset(backdrop);
stage.frame(1, true);
stage.controls.autoRotate = true;
stage.controls.autoRotateSpeed = 0.35;

let last = performance.now();
stage.renderer.setAnimationLoop((now) => {
  const dt = Math.min(100, now - last);
  last = now;
  animator.update(dt);
  stage.update(dt);
  board.update(now);
  stage.render();
});

ui.hideLoading();
ui.show('menu');

// Exposed for debugging and automated smoke tests.
window.__ntuxa = { session, stage, board, pieces, ui, online, audio, get settings() { return settings; } };
