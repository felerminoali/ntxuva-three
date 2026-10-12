/**
 * Localised descriptions of game data. gameLogic.js keeps its English output (used by tests and the
 * server); these helpers produce the same information in the current UI language.
 */
import { binLabel } from './gameLogic.js';
import { t } from './i18n.js';

/** Picks `${key}.one` or `${key}.other` depending on `n`. */
export function plural(key, n, params = {}) {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { ...params, n });
}

export function playerName(player) {
  return t(player === 0 ? 'player.south' : 'player.north');
}

/** Message for a failed `validateMove` result, translated by its code. */
export function moveError(check) {
  const key = `move.${check.code}`;
  const text = t(key);
  return text === key ? check.message : text;
}

/** Localised version of gameLogic's `describeRecord` for the move history. */
export function describeRecordText(record, columns) {
  let text = t('history.sown', { who: playerName(record.player), label: record.label, n: record.sown });
  if (record.laps > 1) text += plural('history.relays', record.laps - 1);
  text += t('history.ends', { bin: binLabel(columns, record.lastBin) });
  if (record.captured) {
    text += t('history.captures', { n: record.captured });
    if (record.extraLabel) text += t('history.extra', { bin: record.extraLabel });
  }
  if (record.loopLimited) text += t('history.loopLimit');
  return text;
}
