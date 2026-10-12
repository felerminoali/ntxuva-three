/**
 * WebSocket client for the online server: request/reply calls, pushed events and
 * automatic reconnection with session resume.
 */
const TOKEN_KEY = 'ntuxa.session';

export class NetClient {
  constructor(url = defaultUrl()) {
    this.url = url;
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.connected = false;
    this.wantOpen = false;
    this.retry = 0;
    this.retryTimer = null;
    this.clockOffset = 0; // serverTime - localTime
    this.facebookAppId = null;
    this.openPromise = null;
  }

  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  set token(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage unavailable: the session lasts until the page closes
    }
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners.get(type) ?? []) fn(data);
  }

  /** Opens the connection (resolves once connected, rejects if the first attempt fails). */
  connect() {
    this.wantOpen = true;
    if (this.connected) return Promise.resolve();
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        this.openPromise = null;
        reject(err);
        return;
      }
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.connected = true;
        this.retry = 0;
        this.openPromise = null;
        resolve();
        this.syncClock();
        this.emit('open');
      };
      ws.onmessage = (e) => this.onMessage(e.data);
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        this.ws = null;
        for (const p of this.pending.values()) p.reject(Object.assign(new Error('disconnected'), { code: 'disconnected' }));
        this.pending.clear();
        if (!opened) {
          this.openPromise = null;
          reject(Object.assign(new Error('offline'), { code: 'offline' }));
        }
        if (was) this.emit('close');
        if (this.wantOpen && opened) this.scheduleReconnect();
      };
    });
    return this.openPromise;
  }

  scheduleReconnect() {
    clearTimeout(this.retryTimer);
    const delay = Math.min(10_000, 500 * 2 ** this.retry++);
    this.retryTimer = setTimeout(async () => {
      if (!this.wantOpen || this.connected) return;
      try {
        await this.connect();
        this.emit('reconnect');
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  disconnect() {
    this.wantOpen = false;
    clearTimeout(this.retryTimer);
    this.ws?.close();
  }

  onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === 'reply') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(Object.assign(new Error(msg.error?.message ?? msg.error?.code), msg.error));
      return;
    }
    if (msg.t === 'hello') this.facebookAppId = msg.facebookAppId;
    this.emit(msg.t, msg);
  }

  request(t, payload = {}, timeoutMs = 15000) {
    if (!this.connected) return Promise.reject(Object.assign(new Error('offline'), { code: 'offline' }));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error('timeout'), { code: 'timeout' }));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify({ t, id, ...payload }));
    });
  }

  async syncClock() {
    try {
      const sent = Date.now();
      const { now } = await this.request('ping');
      const received = Date.now();
      this.clockOffset = now - (sent + received) / 2;
    } catch {
      // keep the previous estimate
    }
  }

  /** Milliseconds left until a server timestamp. */
  remaining(serverDeadline) {
    return serverDeadline - (Date.now() + this.clockOffset);
  }
}

function defaultUrl() {
  const configured = import.meta.env?.VITE_SERVER_URL;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
