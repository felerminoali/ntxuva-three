/**
 * Persistent user settings (localStorage).
 */
const STORAGE_KEY = 'ntuxa.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  music: false,
  volume: 0.7,
  quality: 'medium',
  showCounts: true,
  showHints: true,
  animationSpeed: 1,
  cameraFollow: false,
  columns: 16,
  moveLimit: 0,
  difficulty: 'medium',
  humanSide: 0,
  /** Optional capture rule for offline games: also take one opponent bin of your choice. */
  extraCapture: false,
  scenario: 'village',
  /** '' = auto-detect from the browser (Portuguese by default). */
  language: '',
  onlineExtraCapture: false,
  arenaExtraCapture: false,
});

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof parsed[k] === typeof DEFAULT_SETTINGS[k]) merged[k] = parsed[k];
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings then last for the session only.
  }
}
