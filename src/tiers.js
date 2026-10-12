/**
 * Online stake rooms, shared by the client and the server.
 * Each one-to-one game takes place "in" a Mozambican district or city: the bigger the stake,
 * the more important the place, from district towns up to provincial capitals and finally
 * Maputo City. Both players pay the stake; the winner takes the pot.
 */
export const TIERS = Object.freeze([
  { id: 'massinga', place: 'Massinga', province: 'Inhambane', stake: 1_000, minLevel: 1 },
  { id: 'manhica', place: 'Manhiça', province: 'Maputo', stake: 2_500, minLevel: 1 },
  { id: 'vilankulo', place: 'Vilankulo', province: 'Inhambane', stake: 5_000, minLevel: 1 },
  { id: 'montepuez', place: 'Montepuez', province: 'Cabo Delgado', stake: 10_000, minLevel: 2 },
  { id: 'gurue', place: 'Gurúè', province: 'Zambézia', stake: 25_000, minLevel: 2 },
  { id: 'chokwe', place: 'Chókwè', province: 'Gaza', stake: 50_000, minLevel: 3 },
  { id: 'ilha', place: 'Ilha de Moçambique', province: 'Nampula', stake: 100_000, minLevel: 3 },
  { id: 'xai-xai', place: 'Xai-Xai', province: 'Gaza', stake: 250_000, minLevel: 4 },
  { id: 'inhambane', place: 'Inhambane', province: 'Inhambane', stake: 500_000, minLevel: 4 },
  { id: 'lichinga', place: 'Lichinga', province: 'Niassa', stake: 1_000_000, minLevel: 5 },
  { id: 'pemba', place: 'Pemba', province: 'Cabo Delgado', stake: 2_500_000, minLevel: 5 },
  { id: 'chimoio', place: 'Chimoio', province: 'Manica', stake: 5_000_000, minLevel: 6 },
  { id: 'tete', place: 'Tete', province: 'Tete', stake: 10_000_000, minLevel: 7 },
  { id: 'quelimane', place: 'Quelimane', province: 'Zambézia', stake: 25_000_000, minLevel: 8 },
  { id: 'nampula', place: 'Nampula', province: 'Nampula', stake: 50_000_000, minLevel: 9 },
  { id: 'beira', place: 'Beira', province: 'Sofala', stake: 100_000_000, minLevel: 10 },
  { id: 'matola', place: 'Matola', province: 'Maputo', stake: 500_000_000, minLevel: 12 },
  { id: 'maputo', place: 'Cidade de Maputo', province: 'Maputo Cidade', stake: 2_000_000_000, minLevel: 15 },
]);

export const TIER_BY_ID = Object.freeze(Object.fromEntries(TIERS.map((t) => [t.id, t])));

/** Simulated store packs: no real money changes hands. */
export const STORE_PACKS = Object.freeze([
  { id: 'saco', coins: 10_000 },
  { id: 'cesto', coins: 100_000 },
  { id: 'celeiro', coins: 1_000_000 },
  { id: 'bau', coins: 25_000_000 },
  { id: 'tesouro', coins: 250_000_000 },
]);

/** Experience: every online game counts, wins count triple. */
export function experience({ games = 0, wins = 0 }) {
  return games * 10 + wins * 20;
}

/** Level 1 at 0 XP; each level needs progressively more experience. */
export function levelFor(profile) {
  return Math.floor(Math.sqrt(experience(profile) / 40)) + 1;
}

export function xpForLevel(level) {
  return (level - 1) ** 2 * 40;
}

/** Why a player may not join a tier, or null when they may. */
export function tierBlocker(tier, profile) {
  if (!tier) return 'unknown-tier';
  if (profile.coins < tier.stake) return 'not-enough-coins';
  if (levelFor(profile) < tier.minLevel) return 'level-too-low';
  return null;
}

/** Compact coin formatting: 1K, 2.5M, 2B. */
export function formatCoins(n) {
  const abs = Math.abs(n);
  const fmt = (v, s) => `${Number.isInteger(v) ? v : v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, '')}${s}`;
  if (abs >= 1e9) return fmt(n / 1e9, 'B');
  if (abs >= 1e6) return fmt(n / 1e6, 'M');
  if (abs >= 1e3) return fmt(n / 1e3, 'K');
  return String(n);
}
