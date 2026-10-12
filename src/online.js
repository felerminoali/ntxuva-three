/**
 * Online play: sign-in, lobby (profile, coins, stake rooms), store, leaderboard, matchmaking and
 * the bridge between server pushes and the GameSession's online mode.
 */
import { NetClient } from './net.js';
import { facebookLogin } from './facebook.js';
import { STORE_PACKS, TIERS, TIER_BY_ID, formatCoins, tierBlocker } from './tiers.js';
import { onLanguageChange, t } from './i18n.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class OnlineController {
  constructor({ ui, session, audio, getSettings, saveSettings, net = new NetClient() }) {
    Object.assign(this, { ui, session, audio, getSettings, saveSettings, net });
    this.profile = null;
    this.lobby = { online: 0, waiting: {}, playing: {} };
    this.queuedTier = null;
    this.lastTier = null;
    this.lastExtra = false;
    this.bonusTimer = null;
    this.wired = false;
  }

  // --- Entry ---------------------------------------------------------------------------

  /** Opens the online area from the Play menu. */
  async open() {
    this.wire();
    this.ui.push(this.profile ? 'online' : 'signin');
    if (this.profile && this.net.connected) {
      this.renderLobby();
      return;
    }
    this.setStatus(t('online.connecting'));
    try {
      await this.net.connect();
    } catch {
      this.setStatus(t('online.offline'), true);
      return;
    }
    await this.resume();
  }

  /** Tries to resume a saved session; otherwise shows the sign-in screen. */
  async resume() {
    const token = this.net.token;
    if (!token) {
      this.toSignin();
      return;
    }
    try {
      this.onAuth(await this.net.request('auth.resume', { token }));
    } catch (err) {
      if (err.code === 'bad-token') this.net.token = null;
      this.toSignin();
    }
  }

  toSignin() {
    this.profile = null;
    this.setStatus('');
    $('signin-fb-note').hidden = !!this.net.facebookAppId;
    $('signin-facebook').disabled = !this.net.facebookAppId;
    if (this.ui.current === 'online') this.ui.stack[this.ui.stack.length - 1] = 'signin';
    if (this.ui.current === 'signin') this.ui.render();
  }

  onAuth({ token, profile, lobby, match }) {
    this.net.token = token;
    this.profile = profile;
    if (lobby) this.lobby = lobby;
    this.setStatus('');
    if (match) {
      this.beginMatch(match);
      this.ui.toast(t('online.resumed'));
      return;
    }
    if (this.ui.current === 'signin') this.ui.stack[this.ui.stack.length - 1] = 'online';
    if (this.ui.current === 'online') this.ui.render();
    this.renderLobby();
  }

  // --- Wiring ----------------------------------------------------------------------------

  wire() {
    if (this.wired) return;
    this.wired = true;
    const net = this.net;
    net.on('profile', ({ profile }) => {
      this.profile = profile;
      this.renderProfile();
      this.renderTiers();
    });
    net.on('lobby', ({ lobby }) => {
      this.lobby = lobby;
      this.renderTiers();
    });
    net.on('queue.status', ({ reason }) => {
      this.queuedTier = null;
      if (this.ui.current === 'searching') this.ui.back();
      this.ui.toast(this.errorText({ code: reason }), 'error');
    });
    net.on('match.start', (match) => this.beginMatch(match));
    net.on('game.update', (msg) => this.session.onlineUpdate(msg));
    net.on('game.over', (msg) => {
      if (msg.profile) this.profile = msg.profile;
      this.session.onlineOver(msg);
      this.renderLobby();
    });
    net.on('opponent.status', ({ connected, graceSeconds }) => {
      const name = this.session.online?.opponent.name ?? t('online.opponent');
      if (connected) this.ui.toast(t('online.opponentBack', { name }));
      else this.ui.toast(t('online.opponentAway', { name, s: graceSeconds }), 'error', 5000);
    });
    net.on('close', () => {
      if (this.profile) this.ui.toast(t('online.reconnecting'), 'error');
      this.setStatus(t('online.reconnecting'), true);
    });
    net.on('reconnect', async () => {
      const token = net.token;
      if (!token) return;
      try {
        const data = await net.request('auth.resume', { token });
        this.net.token = data.token;
        this.profile = data.profile;
        if (data.lobby) this.lobby = data.lobby;
        this.setStatus('');
        this.ui.toast(t('online.reconnected'));
        if (data.match && this.session.online?.gameId === data.match.gameId) this.session.resyncOnline(data.match);
        else if (data.match) this.beginMatch(data.match);
        else if (this.queuedTier) {
          // The queue does not survive a disconnect: rejoin it.
          this.join(this.queuedTier, this.lastExtra, true);
        }
        this.renderLobby();
      } catch {
        this.toSignin();
      }
    });

    $('signin-guest').addEventListener('submit', () => this.signInGuest());
    $('signin-facebook').addEventListener('click', () => this.signInFacebook());
    $('online-facebook').addEventListener('click', () => this.signInFacebook());
    $('online-signout').addEventListener('click', () => this.signOut());
    $('online-rename').addEventListener('click', () => this.rename());
    $('online-bonus').addEventListener('click', () => this.claimBonus());
    $('online-store').addEventListener('click', () => {
      this.renderStore();
      this.ui.push('store');
    });
    $('online-leaderboard').addEventListener('click', () => this.showLeaderboard());
    $('searching-cancel').addEventListener('click', () => this.cancelSearch());
    document.querySelectorAll('input[name="online-rule"]').forEach((input) =>
      input.addEventListener('change', () => {
        this.saveSettings({ onlineExtraCapture: this.selectedExtra() });
      }),
    );
    onLanguageChange(() => this.renderLobby());
    this.bonusTimer = setInterval(() => {
      if (this.ui.current === 'online') this.renderBonus();
    }, 30_000);
  }

  selectedExtra() {
    return document.querySelector('input[name="online-rule"]:checked')?.value === 'extra';
  }

  setStatus(text, error = false) {
    for (const id of ['online-status', 'signin-status']) {
      const node = $(id);
      node.textContent = text;
      node.classList.toggle('error', error);
    }
  }

  errorText(err) {
    const code = err?.code ?? 'generic';
    const key = `error.${code}`;
    const text = t(key);
    return text === key ? t('error.generic', { code }) : text;
  }

  async call(type, payload) {
    try {
      return await this.net.request(type, payload);
    } catch (err) {
      this.ui.toast(err.code === 'offline' || err.code === 'disconnected' ? t('online.offline') : this.errorText(err), 'error');
      throw err;
    }
  }

  // --- Account ---------------------------------------------------------------------------

  async signInGuest() {
    const name = $('signin-name').value.trim();
    try {
      await this.net.connect();
      const data = await this.call('auth.guest', { name });
      this.onAuth(data);
      this.ui.toast(t('account.welcome', { name: data.profile.name, coins: data.profile.coins.toLocaleString() }));
    } catch {
      // toast already shown
    }
  }

  async signInFacebook() {
    const appId = this.net.facebookAppId;
    if (!appId) {
      this.ui.toast(t('account.facebookUnavailable'), 'error');
      return;
    }
    let accessToken;
    try {
      accessToken = await facebookLogin(appId);
    } catch {
      this.ui.toast(t('account.facebookFailed'), 'error');
      return;
    }
    try {
      await this.net.connect();
      this.onAuth(await this.call('auth.facebook', { accessToken }));
    } catch {
      // toast already shown
    }
  }

  async signOut() {
    try {
      await this.call('auth.logout');
    } catch {
      return;
    }
    this.net.token = null;
    this.toSignin();
  }

  async rename() {
    const name = window.prompt(t('account.renamePrompt'), this.profile?.name ?? '');
    if (name === null) return;
    try {
      const { profile } = await this.call('profile.rename', { name });
      this.profile = profile;
      this.renderProfile();
    } catch {
      // toast already shown
    }
  }

  async claimBonus() {
    try {
      const { amount } = await this.call('bonus.claim');
      this.audio.win();
      this.ui.toast(t('account.bonusClaimed', { coins: amount.toLocaleString() }), 'capture');
    } catch {
      // toast already shown
    }
  }

  // --- Lobby rendering --------------------------------------------------------------------

  renderLobby() {
    if (!this.profile) return;
    const rule = this.getSettings().onlineExtraCapture ? 'extra' : 'column';
    const radio = document.querySelector(`input[name="online-rule"][value="${rule}"]`);
    if (radio) radio.checked = true;
    this.renderProfile();
    this.renderTiers();
  }

  renderProfile() {
    const p = this.profile;
    if (!p) return;
    const avatar = $('profile-avatar');
    avatar.replaceChildren();
    if (p.avatar) {
      const img = el('img');
      img.src = p.avatar;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      avatar.append(img);
    } else {
      avatar.textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    }
    $('profile-name').textContent = p.name;
    $('profile-fb').hidden = !p.facebook;
    $('profile-level').textContent = t('account.level', { n: p.level });
    const span = Math.max(1, p.nextLevelXp - p.levelXp);
    $('profile-xp').style.width = `${Math.min(100, ((p.xp - p.levelXp) / span) * 100)}%`;
    $('profile-record').textContent = t('account.record', { w: p.wins, l: p.losses, r: p.rating });
    $('profile-coins').textContent = p.coins.toLocaleString();
    $('profile-coins').title = `${p.coins.toLocaleString()} ${t('account.coins')}`;
    $('online-facebook').hidden = p.facebook;
    this.renderBonus();
  }

  renderBonus() {
    const p = this.profile;
    if (!p) return;
    const btn = $('online-bonus');
    const wait = p.bonusAt - (Date.now() + this.net.clockOffset);
    if (wait <= 0) {
      btn.disabled = false;
      btn.textContent = t('account.dailyBonus', { coins: formatCoins(p.dailyBonus) });
    } else {
      btn.disabled = true;
      const minutes = Math.ceil(wait / 60_000);
      btn.textContent = t('account.bonusIn', { h: Math.floor(minutes / 60), m: minutes % 60 });
    }
  }

  renderTiers() {
    const p = this.profile;
    if (!p) return;
    $('online-count').textContent = t('online.playersOnline', { n: this.lobby.online ?? 0 });
    const list = $('tier-list');
    list.replaceChildren(
      ...TIERS.map((tier, i) => {
        const blocker = tierBlocker(tier, p);
        const li = el('li', `tier${blocker ? ' locked' : ''}${i >= TIERS.length - 3 ? ' capital' : ''}`);
        li.style.setProperty('--rank', String(i / (TIERS.length - 1)));
        const info = el('div', 'tier-info');
        info.append(el('div', 'tier-place', tier.place), el('div', 'tier-province', tier.province));
        const stake = el('div', 'tier-stake');
        stake.append(el('span', 'coin'), el('b', '', formatCoins(tier.stake)));
        const meta = el('div', 'tier-meta');
        meta.append(
          el('span', '', `${t('online.pot')} ${formatCoins(tier.stake * 2)}`),
          el('span', '', t('online.minLevel', { n: tier.minLevel })),
        );
        const waiting = this.lobby.waiting?.[tier.id] ?? 0;
        const playing = this.lobby.playing?.[tier.id] ?? 0;
        if (waiting) meta.append(el('span', 'live', t('online.waiting', { n: waiting })));
        if (playing) meta.append(el('span', '', t('online.playing', { n: playing })));
        const btn = el('button', 'btn small primary');
        if (blocker === 'not-enough-coins') btn.textContent = t('online.locked.coins');
        else if (blocker === 'level-too-low') btn.textContent = t('online.locked.level', { n: tier.minLevel });
        else btn.textContent = t('online.join');
        btn.disabled = !!blocker;
        btn.addEventListener('click', () => this.join(tier.id, this.selectedExtra()));
        li.append(info, stake, meta, btn);
        return li;
      }),
    );
  }

  renderStore() {
    const grid = $('store-grid');
    grid.replaceChildren(
      ...STORE_PACKS.map((pack, i) => {
        const card = el('article', 'store-pack');
        card.style.setProperty('--size', String(i));
        const icon = el('div', 'pack-icon');
        for (let k = 0; k <= i; k++) icon.append(el('span', 'coin'));
        const btn = el('button', 'btn small primary', t('store.get'));
        btn.addEventListener('click', () => this.buy(pack.id, btn));
        card.append(icon, el('h3', '', t(`store.pack.${pack.id}`)), el('div', 'pack-coins', `+${formatCoins(pack.coins)}`), btn);
        return card;
      }),
    );
  }

  async buy(packId, btn) {
    btn.disabled = true;
    try {
      const { coins } = await this.call('store.buy', { pack: packId });
      this.audio.capture?.();
      this.ui.toast(t('store.got', { coins: coins.toLocaleString() }), 'capture');
    } catch {
      // toast already shown
    } finally {
      btn.disabled = false;
    }
  }

  async showLeaderboard() {
    this.ui.push('leaderboard');
    const list = $('leaderboard-list');
    list.replaceChildren(el('li', 'note', t('online.connecting')));
    let players = [];
    try {
      ({ players } = await this.call('leaderboard.get'));
    } catch {
      return;
    }
    list.replaceChildren(
      ...(players.length
        ? players.map((pl) => {
            const li = el('li', pl.id === this.profile?.id ? 'me' : '');
            li.append(
              el('span', 'lb-name', pl.name),
              el('span', 'lb-stats', `${pl.wins}/${pl.games} · ${pl.rating}`),
              el('span', 'lb-coins', formatCoins(pl.coins)),
            );
            return li;
          })
        : [el('li', 'note', t('leaderboard.empty'))]),
    );
  }

  // --- Matchmaking --------------------------------------------------------------------------

  async join(tierId, extraCapture, silent = false) {
    const tier = TIER_BY_ID[tierId];
    this.audio.unlock();
    this.lastTier = tierId;
    this.lastExtra = extraCapture;
    let result;
    try {
      result = await this.call('queue.join', { tier: tierId, extraCapture });
    } catch {
      return;
    }
    if (result.matched) return; // match.start arrives as a push
    this.queuedTier = tierId;
    $('searching-room').textContent = t('online.searchingIn', {
      place: tier.place,
      province: tier.province,
      stake: formatCoins(tier.stake),
    });
    $('searching-rule').textContent = t('online.searchingRule', {
      rule: extraCapture ? t('rule.extraShort') : t('rule.columnShort'),
    });
    if (!silent || this.ui.current !== 'searching') {
      if (this.session.inGame) this.session.exitToMenu();
      if (this.ui.current !== 'searching') this.ui.push('searching');
    }
  }

  async cancelSearch() {
    this.queuedTier = null;
    try {
      await this.net.request('queue.leave');
    } catch {
      // the queue is dropped server-side when the connection closes anyway
    }
    if (this.ui.current === 'searching') this.ui.back();
    if (!this.ui.current) this.ui.show('online');
    this.renderLobby();
  }

  beginMatch(match) {
    this.queuedTier = null;
    this.lastTier = match.tier;
    this.lastExtra = match.extraCapture;
    const tier = TIER_BY_ID[match.tier];
    this.session.startOnline(match, {
      selfName: this.profile?.name ?? t('online.you'),
      selfProfile: this.profile ?? null,
      send: (action) => this.net.request('game.action', { gameId: match.gameId, action }),
      remaining: (deadline) => this.net.remaining(deadline),
      errorText: (err) => this.errorText(err),
      againLabel: () => t('online.playAgain', { place: tier.place }),
    });
    if (!match.resume) {
      this.audio.win();
      this.ui.toast(t('online.matchFound', { name: match.opponent.name }), 'capture', 3500);
      this.ui.toast(
        t('online.matchIn', { place: tier.place, stake: formatCoins(match.stake), pot: formatCoins(match.stake * 2) }),
        'info',
        4500,
      );
    }
  }

  /** "Play again" on the end screen: rejoin the same room with the same rule. */
  playAgain() {
    if (!this.lastTier) return this.backToLobby();
    const blocker = tierBlocker(TIER_BY_ID[this.lastTier], this.profile ?? { coins: 0 });
    if (blocker) {
      this.ui.toast(this.errorText({ code: blocker }), 'error');
      this.backToLobby();
      return;
    }
    this.join(this.lastTier, this.lastExtra);
  }

  backToLobby() {
    this.session.exitToMenu();
    this.ui.show('menu');
    this.ui.push('play');
    this.ui.push('online');
    this.renderLobby();
  }

  async resign() {
    const gameId = this.session.online?.gameId;
    if (!gameId || !this.session.onlineActive) return true;
    if (!window.confirm(t('online.resignConfirm'))) return false;
    try {
      await this.call('game.resign', { gameId });
      return true;
    } catch {
      return false;
    }
  }

  /** Leaving an active online game resigns it (after confirmation). */
  async confirmLeave() {
    const gameId = this.session.online?.gameId;
    if (!gameId || !this.session.onlineActive) return true;
    if (!window.confirm(t('online.leaveConfirm'))) return false;
    try {
      await this.net.request('game.resign', { gameId });
    } catch {
      // if the server is unreachable the abandon timer resolves the game
    }
    return true;
  }
}
