/**
 * Competitions lobby ("vs Computer"): the player's career card, a carousel of city competitions
 * with growing entry fees and opponent skill, the animated opponent draw, and the bridge to the
 * game session. Signed-in players play on the server (career saved in its database); everyone
 * else plays with the career saved on this device.
 */
import { COMPETITIONS, COMPETITION_BY_ID, MAX_SKILL, competitionBlocker, makeBot } from './competitions.js';
import { DeviceCareer, LocalCompetition } from './arenaLocal.js';
import { formatCoins } from './tiers.js';
import { onLanguageChange, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const AVATAR_SIZE = 96;
const AVATAR_MAX = 12_000;
const DRAW_CARDS = 30;
const DRAW_WINNER = 25;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setAvatar(node, profile) {
  node.replaceChildren();
  const initial = (profile?.name || '?').trim().charAt(0).toUpperCase() || '?';
  if (profile?.avatar) {
    const img = el('img');
    img.src = profile.avatar;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => (node.textContent = initial), { once: true });
    node.append(img);
  } else node.textContent = initial;
}

function skillBar(skill) {
  const bar = el('span', 'skill-bar');
  bar.style.setProperty('--skill', String(skill / MAX_SKILL));
  bar.title = t('arena.skillOf', { n: skill, max: MAX_SKILL });
  return bar;
}

/** Resizes an image file to a small square JPEG data URL that fits the server's limit. */
export async function avatarFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('bad-image'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= AVATAR_MAX) return data;
    }
    throw new Error('bad-image');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class ArenaController {
  constructor({ ui, session, audio, online, getSettings, saveSettings, career = new DeviceCareer() }) {
    Object.assign(this, { ui, session, audio, online, getSettings, saveSettings, career });
    online.arena = this;
    this.local = null;
    this.lastCompetition = null;
    this.drawTimers = [];
    online.onProfileChange(() => {
      if (this.ui.current === 'arena') this.render();
    });

    $('arena-avatar-btn').addEventListener('click', () => $('arena-avatar-file').click());
    $('arena-avatar-file').addEventListener('change', (e) => this.uploadAvatar(e.target));
    $('arena-rename').addEventListener('click', () => this.rename());
    $('arena-bonus').addEventListener('click', () => this.wheel?.open());
    $('arena-store').addEventListener('click', () => this.online.openStore());
    $('arena-leaderboard').addEventListener('click', () => this.online.showLeaderboard());
    $('arena-signin').addEventListener('click', () => this.online.open());
    $('comp-prev').addEventListener('click', () => this.scroll(-1));
    $('comp-next').addEventListener('click', () => this.scroll(1));
    document.querySelectorAll('input[name="arena-rule"]').forEach((input) =>
      input.addEventListener('change', () => this.saveSettings({ arenaExtraCapture: this.selectedExtra() })),
    );
    onLanguageChange(() => {
      if (this.ui.current === 'arena') this.render();
    });
  }

  /** Signed in to the server? Otherwise the career on this device is used. */
  get serverMode() {
    return !!this.online.profile;
  }

  get profile() {
    return this.online.profile ?? this.career.profile;
  }

  deviceProfile() {
    return this.career.profile;
  }

  selectedExtra() {
    return document.querySelector('input[name="arena-rule"]:checked')?.value === 'extra';
  }

  open() {
    this.audio.unlock();
    if (this.ui.current !== 'arena') this.ui.push('arena');
    this.render(true);
    this.wheel?.maybePrompt({ rescueOnly: true });
  }

  // --- Lobby ---------------------------------------------------------------------------------

  render(center = false) {
    const p = this.profile;
    const career = p.career ?? {};
    const rule = this.getSettings().arenaExtraCapture ? 'extra' : 'column';
    const radio = document.querySelector(`input[name="arena-rule"][value="${rule}"]`);
    if (radio) radio.checked = true;

    setAvatar($('arena-avatar'), p);
    $('arena-name').textContent = p.name || t('menu.guest');
    $('arena-fb').hidden = !p.facebook;
    $('arena-source').textContent = t(this.serverMode ? 'arena.sourceServer' : 'arena.sourceDevice');
    $('arena-source').classList.toggle('server', this.serverMode);
    const title = t(`rank.${career.rankTitle ?? 'player'}`);
    $('arena-rank').textContent = career.rank ? t('arena.rankPos', { title, n: career.rank }) : title;
    $('arena-coins').textContent = p.coins.toLocaleString();
    $('arena-coins').title = `${p.coins.toLocaleString()} ${t('account.coins')}`;
    const games = career.aiGames ?? 0;
    const wins = career.aiWins ?? 0;
    const stats = [
      ['arena.statWon', wins.toLocaleString()],
      ['arena.statRate', games ? `${Math.round((wins / games) * 100)}%` : '—'],
      ['arena.statWinnings', formatCoins(career.winnings ?? 0)],
      ['arena.statTournaments', (career.tournaments ?? 0).toLocaleString()],
      ['arena.statRating', String(career.aiRating ?? 1200)],
      ['arena.statGames', games.toLocaleString()],
    ];
    $('arena-stats').replaceChildren(
      ...stats.map(([key, value]) => {
        const box = el('div', 'stat');
        box.append(el('b', '', value), el('span', '', t(key)));
        return box;
      }),
    );
    $('arena-signin').hidden = this.serverMode;
    $('arena-leaderboard').hidden = !this.serverMode;
    $('arena-store').hidden = !this.serverMode;
    this.wheel?.renderChips();
    this.renderCompetitions(center);
  }

  scroll(dir) {
    const list = $('comp-list');
    const card = list.querySelector('.tier');
    const step = card ? card.getBoundingClientRect().width + 12 : list.clientWidth * 0.8;
    list.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  renderCompetitions(center) {
    const p = this.profile;
    const trophies = p.career?.trophies ?? {};
    const list = $('comp-list');
    const scrollLeft = list.scrollLeft;
    const keep = !center && list.childElementCount > 0;

    const friendly = el('li', 'tier friendly');
    const fBanner = el('div', 'tier-banner');
    fBanner.append(el('div', 'tier-place', t('arena.friendly')), el('div', 'tier-province', t('arena.friendlySub')));
    const fBody = el('div', 'tier-prize');
    fBody.append(el('div', 'tier-label', t('arena.noBet')), el('div', 'friendly-levels', t('arena.friendlyLevels')));
    const fBtn = el('button', 'btn tier-play', t('arena.practise'));
    fBtn.addEventListener('click', () => this.ui.openSetup('ai'));
    friendly.append(fBanner, fBody, el('div', 'tier-meta'), fBtn);

    let best = 1;
    const cards = COMPETITIONS.map((comp, i) => {
      const blocker = competitionBlocker(comp, p);
      if (!blocker) best = i + 1;
      const li = el('li', `tier${blocker ? ' locked' : ''}${i >= COMPETITIONS.length - 2 ? ' capital' : ''}`);
      li.style.setProperty('--rank', String(i / (COMPETITIONS.length - 1)));
      li.style.setProperty('--hue', String(150 - (i / (COMPETITIONS.length - 1)) * 150));
      const banner = el('div', 'tier-banner');
      banner.append(el('div', 'tier-place', comp.place), el('div', 'tier-province', comp.province));
      const prize = el('div', 'tier-prize');
      const amount = el('div', 'tier-prize-amount');
      amount.append(el('span', 'coin'), el('b', '', formatCoins(comp.stake * 2)));
      prize.append(el('div', 'tier-label', t('online.prize')), amount);
      const entry = el('div', 'tier-entry');
      entry.append(el('span', 'tier-label', t('online.entry')), el('span', 'coin'), el('b', '', formatCoins(comp.stake)));
      const meta = el('div', 'tier-meta');
      const skill = el('span', 'comp-skill');
      skill.append(el('span', '', t('arena.skillRange', { a: comp.skill[0], b: comp.skill[1] })), skillBar(comp.skill[1]));
      meta.append(skill);
      if (trophies[comp.id]) meta.append(el('span', 'live', t('arena.trophies', { n: trophies[comp.id] })));
      const btn = el('button', 'btn primary tier-play');
      btn.textContent = blocker ? t('arena.needCoins', { coins: formatCoins(comp.stake) }) : t('arena.enter');
      btn.disabled = !!blocker;
      btn.addEventListener('click', () => this.join(comp.id));
      li.append(banner, prize, entry, meta, btn);
      return li;
    });
    list.replaceChildren(friendly, ...cards);
    if (keep) list.scrollLeft = scrollLeft;
    else {
      requestAnimationFrame(() => {
        const target = list.children[best];
        if (target) list.scrollLeft = target.offsetLeft - (list.clientWidth - target.offsetWidth) / 2;
      });
    }
  }

  // --- Account actions ------------------------------------------------------------------------

  async rename() {
    if (this.serverMode) return this.online.rename();
    const name = window.prompt(t('account.renamePrompt'), this.career.data.name ?? '');
    if (name === null) return;
    this.career.rename(name);
    this.online.renderMenuBar();
    this.render();
  }

  async uploadAvatar(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let avatar;
    try {
      avatar = await avatarFromFile(file);
    } catch {
      this.ui.toast(t('error.bad-avatar'), 'error');
      return;
    }
    if (this.serverMode) {
      try {
        const { profile } = await this.online.call('profile.avatar', { avatar });
        this.online.profile = profile;
      } catch {
        return;
      }
    } else this.career.setAvatar(avatar);
    this.online.renderMenuBar();
    this.render();
    this.ui.toast(t('arena.avatarSaved'));
  }

  // --- Playing -------------------------------------------------------------------------------

  async join(competitionId) {
    const comp = COMPETITION_BY_ID[competitionId];
    const blocker = competitionBlocker(comp, this.profile);
    if (blocker) {
      this.ui.toast(this.online.errorText({ code: blocker }), 'error');
      return;
    }
    this.audio.unlock();
    this.lastCompetition = competitionId;
    const extraCapture = this.selectedExtra();
    if (this.serverMode) {
      // The server answers with a `match.start` push, handled by beginServerMatch.
      try {
        await this.online.call('competition.join', { competition: competitionId, extraCapture });
      } catch {
        // toast already shown
      }
      return;
    }
    if (this.session.inGame) this.session.exitToMenu();
    let game;
    try {
      game = new LocalCompetition({
        career: this.career,
        competition: comp,
        extraCapture,
        emit: (msg) => this.onLocalMessage(msg),
        isPaused: () => this.session.paused && this.session.online?.gameId === game.gameId,
      });
    } catch (err) {
      this.ui.toast(this.online.errorText(err), 'error');
      return;
    }
    this.local = game;
    const match = game.startMessage();
    this.start(match, {
      selfName: this.career.data.name || t('online.you'),
      selfProfile: this.career.profile,
      send: (action) => game.send(action),
      remaining: () => 0,
      errorText: (err) => this.online.errorText(err),
      resign: () => this.resignLocal(game),
      confirmLeave: () => this.leaveLocal(game),
      dispose: () => game.dispose(),
    });
    this.online.renderMenuBar();
    game.begin();
  }

  onLocalMessage(msg) {
    if (msg.t === 'game.update') this.session.onlineUpdate(msg);
    else if (msg.t === 'game.over') {
      this.session.onlineOver(msg);
      this.online.renderMenuBar();
    }
  }

  resignLocal(game) {
    if (game.over) return true;
    if (!window.confirm(t('online.resignConfirm'))) return false;
    game.resign();
    return true;
  }

  leaveLocal(game) {
    if (game.over) return true;
    if (!window.confirm(t('online.leaveConfirm'))) return false;
    game.resign();
    return true;
  }

  /** A competition `match.start` pushed by the server. */
  beginServerMatch(match, link) {
    this.lastCompetition = match.competition;
    this.start(match, link);
  }

  start(match, link) {
    const comp = COMPETITION_BY_ID[match.competition];
    this.session.startOnline(match, {
      ...link,
      againLabel: () => t('arena.playAgain', { place: comp?.place ?? '' }),
      playAgain: () => this.playAgain(),
      backToLobby: () => this.backToLobby(),
    });
    if (!match.resume) this.playIntro(match, link.selfProfile);
  }

  playAgain() {
    const comp = COMPETITION_BY_ID[this.lastCompetition];
    if (!comp || competitionBlocker(comp, this.profile)) {
      if (comp) this.ui.toast(this.online.errorText({ code: 'not-enough-coins' }), 'error');
      this.backToLobby();
      return;
    }
    this.join(comp.id);
  }

  backToLobby() {
    this.session.exitToMenu();
    this.ui.show('menu');
    this.ui.push('arena');
    this.render(true);
    this.wheel?.maybePrompt({ rescueOnly: true });
  }

  // --- Opponent draw ---------------------------------------------------------------------------

  /** The roulette of possible opponents that slows down on the drawn one. */
  playIntro(match, selfProfile) {
    this.drawTimers.forEach(clearTimeout);
    this.drawTimers = [];
    const comp = COMPETITION_BY_ID[match.competition];
    const opponent = match.opponent;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const spinMs = reduced ? 600 : 2800;

    $('draw-place').textContent = `${comp.place} · ${comp.province}`;
    $('draw-stake').textContent = t('arena.drawStake', { stake: formatCoins(comp.stake), prize: formatCoins(comp.stake * 2) });
    $('draw-status').textContent = t('arena.drawing');
    $('draw-result').hidden = true;
    $('draw-side').textContent = '';
    $('screen-draw').classList.remove('revealed');

    const strip = $('draw-strip');
    const cards = [];
    for (let i = 0; i < DRAW_CARDS; i++) {
      const [lo, hi] = comp.skill;
      const bot = i === DRAW_WINNER ? opponent : makeBot(lo + Math.floor(Math.random() * (hi - lo + 1)));
      const li = el('li', `draw-card${i === DRAW_WINNER ? ' chosen' : ''}`);
      const face = el('span', 'avatar');
      setAvatar(face, bot);
      li.append(face, el('span', 'draw-card-name', bot.name.split(' ')[0]), skillBar(bot.skill));
      cards.push(li);
    }
    strip.replaceChildren(...cards);
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';

    this.ui.push('draw');
    this.audio.select();

    requestAnimationFrame(() => {
      const reel = $('draw-reel');
      const card = cards[DRAW_WINNER];
      const target = card.offsetLeft + card.offsetWidth / 2 - reel.clientWidth / 2;
      // A small random offset so the reel does not always stop dead centre.
      const jitter = (Math.random() - 0.5) * card.offsetWidth * 0.4;
      strip.getBoundingClientRect();
      strip.style.transition = `transform ${spinMs}ms cubic-bezier(.12,.72,.16,1)`;
      strip.style.transform = `translateX(${-(target + jitter)}px)`;
      this.tickReel(strip, card.offsetWidth, spinMs);
      this.drawTimers.push(
        setTimeout(() => {
          strip.style.transition = 'transform 260ms ease-out';
          strip.style.transform = `translateX(${-target}px)`;
          this.reveal(match, selfProfile);
        }, spinMs + 60),
      );
    });
  }

  tickReel(strip, cardWidth, spinMs) {
    let lastIndex = 0;
    const started = performance.now();
    const step = () => {
      if (this.ui.current !== 'draw' || performance.now() - started > spinMs) return;
      const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
      const index = Math.floor(-x / (cardWidth + 10));
      if (index !== lastIndex) {
        lastIndex = index;
        this.audio.hover();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  reveal(match, selfProfile) {
    if (this.ui.current !== 'draw') return;
    const opp = match.opponent;
    $('screen-draw').classList.add('revealed');
    $('draw-status').textContent = t('arena.opponentFound');
    setAvatar($('draw-me'), selfProfile ?? this.profile);
    $('draw-me-name').textContent = (selfProfile ?? this.profile)?.name || t('online.you');
    setAvatar($('draw-opp'), opp);
    $('draw-opp-name').textContent = opp.name;
    $('draw-opp-skill').replaceChildren(el('span', '', t('arena.skillOf', { n: opp.skill, max: MAX_SKILL })), skillBar(opp.skill));
    $('draw-opp-record').textContent = t('arena.botRecord', { w: opp.wins, g: opp.games, r: opp.rating });
    $('draw-side').textContent = t(match.side === 0 ? 'arena.youStart' : 'arena.theyStart');
    $('draw-result').hidden = false;
    this.audio.win();
    this.drawTimers.push(
      setTimeout(() => {
        if (this.ui.current === 'draw') this.ui.show(null);
      }, 1500),
    );
  }
}
