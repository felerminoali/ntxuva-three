/**
 * Competitions against computer players, shared by the browser (device profile) and the server.
 *
 * Each competition is a 1-on-1 game "in" a Mozambican city with an entry fee; the winner takes
 * twice the entry. Every competition has a band of computer skill on a 1-20 scale. The opponent
 * is drawn at random between the band's floor and the skill matched to the player's rating, so
 * games vary from relaxed to fully matched, like meeting different people at the table.
 */

import { levelFor } from './tiers.js';

export const MAX_SKILL = 20;
export const STARTING_RATING = 1200;

export const COMPETITIONS = Object.freeze([
  { id: 'cuamba', place: 'Cuamba', province: 'Niassa', stake: 1_000_000, skill: [1, 6] },
  { id: 'nampula', place: 'Nampula', province: 'Nampula', stake: 5_000_000, skill: [2, 8] },
  { id: 'quelimane', place: 'Quelimane', province: 'Zambézia', stake: 10_000_000, skill: [3, 10] },
  { id: 'tete', place: 'Tete', province: 'Tete', stake: 25_000_000, skill: [5, 12] },
  { id: 'chimoio', place: 'Chimoio', province: 'Manica', stake: 50_000_000, skill: [6, 13] },
  { id: 'pemba', place: 'Pemba', province: 'Cabo Delgado', stake: 100_000_000, skill: [8, 15] },
  { id: 'beira', place: 'Beira', province: 'Sofala', stake: 250_000_000, skill: [10, 16] },
  { id: 'xai-xai', place: 'Xai-Xai', province: 'Gaza', stake: 500_000_000, skill: [12, 18] },
  { id: 'matola', place: 'Matola', province: 'Maputo', stake: 1_000_000_000, skill: [14, 19] },
  { id: 'maputo', place: 'Cidade de Maputo', province: 'Maputo Cidade', stake: 2_000_000_000, skill: [16, 20] },
]);

export const COMPETITION_BY_ID = Object.freeze(Object.fromEntries(COMPETITIONS.map((c) => [c.id, c])));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Skill (1-20) that plays at about the given rating. */
export function skillForRating(rating) {
  return clamp(Math.round((rating - 950) / 45), 1, MAX_SKILL);
}

/** Rating that a computer player of the given skill represents. */
export function ratingForSkill(skill) {
  return 950 + 45 * skill;
}

/** The skill matched to the player's rating, kept inside the competition's band. */
export function matchedSkill(competition, rating) {
  const [floor, ceil] = competition.skill;
  return clamp(skillForRating(rating), floor, ceil);
}

/** Random integer skill from the band's floor up to the matched skill. */
export function drawSkill(competition, rating, rng = Math.random) {
  const floor = competition.skill[0];
  const top = matchedSkill(competition, rating);
  return floor + Math.floor(rng() * (top - floor + 1));
}

/** Why a player may not enter a competition, or null when they may. */
export function competitionBlocker(competition, profile) {
  if (!competition) return 'unknown-competition';
  if ((profile?.coins ?? 0) < competition.stake) return 'not-enough-coins';
  return null;
}

/** Elo change for a player rated `rating` scoring `score` (1, 0.5, 0) against `opponent`. */
export function eloDelta(rating, opponent, score, k = 24) {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(k * (score - expected));
}

/** Coins returned to the player when a competition ends. */
export function payoutFor(competition, outcome) {
  if (outcome === 'win') return competition.stake * 2;
  if (outcome === 'draw') return competition.stake;
  return 0;
}

export const RANK_TITLES = Object.freeze([
  { id: 'novice', min: 0 },
  { id: 'apprentice', min: 1100 },
  { id: 'player', min: 1200 },
  { id: 'skilled', min: 1300 },
  { id: 'expert', min: 1450 },
  { id: 'master', min: 1600 },
  { id: 'grandmaster', min: 1750 },
]);

/** Named rank from a rating (translated with `rank.<id>`). */
export function rankTitle(rating) {
  let id = RANK_TITLES[0].id;
  for (const r of RANK_TITLES) if (rating >= r.min) id = r.id;
  return id;
}

// --- Computer players ---------------------------------------------------------------------

const FIRST_NAMES = [
  'Abdul', 'Ancha', 'Benvinda', 'Carlitos', 'Celso', 'Custódio', 'Dércio', 'Domingos', 'Elsa', 'Esperança',
  'Felizarda', 'Fátima', 'Gildo', 'Graça', 'Hélder', 'Horácio', 'Inocência', 'Ivone', 'Jacinto', 'Januário',
  'Laurinda', 'Lurdes', 'Manuel', 'Momade', 'Nádia', 'Nelinha', 'Orlando', 'Ossufo', 'Paulino', 'Percina',
  'Rafael', 'Rosalina', 'Sérgio', 'Sónia', 'Tomásia', 'Ussene', 'Valdemar', 'Virgínia', 'Zaida', 'Zito',
];
const SURNAMES = [
  'Mabunda', 'Cossa', 'Machava', 'Nhantumbo', 'Sitoe', 'Langa', 'Tembe', 'Muianga', 'Novela', 'Bila',
  'Matsinhe', 'Mussa', 'Abudo', 'Assane', 'Amade', 'Zandamela', 'Massingue', 'Uamusse', 'Chirindza', 'Cumbe',
  'Mucavele', 'Macuácua', 'Nhaca', 'Chongo', 'Muchanga', 'Saide', 'Jamal', 'Daúde', 'Mondjane', 'Tivane',
];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** Simple round avatar (an SVG data URL) with the player's initials. */
export function initialsAvatar(name, hue) {
  const initials = name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},55%,52%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,28%)"/>` +
    `</linearGradient></defs><rect width="64" height="64" fill="url(#g)"/>` +
    `<path d="M0 50 L16 40 L32 50 L48 40 L64 50 V64 H0Z" fill="rgba(0,0,0,.18)"/>` +
    `<text x="32" y="40" font-family="Georgia,serif" font-size="24" font-weight="700" text-anchor="middle" fill="#fff6e6">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A computer player of the given skill, with a name, avatar and plausible history. */
export function makeBot(skill, rng = Math.random) {
  const name = `${pick(FIRST_NAMES, rng)} ${pick(SURNAMES, rng)}`;
  const hue = Math.floor(rng() * 360);
  const games = 15 + Math.floor(rng() * (20 + skill * 35));
  const wins = Math.round(games * clamp(0.28 + skill * 0.025 + (rng() - 0.5) * 0.08, 0.1, 0.9));
  const rating = ratingForSkill(skill) + Math.round((rng() - 0.5) * 40);
  return {
    id: `bot-${Math.floor(rng() * 1e9).toString(36)}`,
    bot: true,
    name,
    avatar: initialsAvatar(name, hue),
    skill,
    rating,
    games,
    wins,
    level: levelFor({ games, wins }),
  };
}

/** Draws the opponent for a competition: random skill up to the matched level. */
export function drawOpponent(competition, rating, rng = Math.random) {
  return makeBot(drawSkill(competition, rating, rng), rng);
}
