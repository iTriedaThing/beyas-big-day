export class Api {
  constructor(config, storage = sessionStorage, fetcher = globalThis.fetch.bind(globalThis)) {
    this.url = config.supabaseUrl.replace(/\/$/, '');
    this.key = config.publishableKey;
    this.storage = storage;
    this.fetcher = fetcher;
    this.prefix = `wedding:${this.url}:`;
    this.session = JSON.parse(storage.getItem(this.prefix + 'session') || 'null');
  }
  setSession(session) {
    this.session = session;
    if (session) this.storage.setItem(this.prefix + 'session', JSON.stringify(session));
    else this.storage.removeItem(this.prefix + 'session');
    this.onSession?.();
  }
  async auth(path, body) {
    const res = await this.fetcher(`${this.url}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json',
        ...(path === 'logout' && this.session ? { Authorization: `Bearer ${this.session.access_token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(result.msg || result.error_description || result.message || 'Sign-in request failed.');
      error.definite = res.status >= 400 && res.status < 500;
      throw error;
    }
    return result;
  }
  async signIn(email, password) {
    const s = await this.auth('token?grant_type=password', { email, password });
    this.setSession({ ...s, expires_at: Math.floor(Date.now() / 1000) + s.expires_in });
  }
  async refresh() {
    if (!this.refreshing) this.refreshing = (async () => {
      const originalToken = this.session?.refresh_token;
      try {
        const s = await this.auth('token?grant_type=refresh_token', { refresh_token: originalToken });
        if (this.session?.refresh_token === originalToken) this.setSession({ ...s, expires_at: Math.floor(Date.now() / 1000) + s.expires_in });
      } catch (error) {
        // Keep the session on network failures; a later reconnect can still refresh it.
        if (error.definite && this.session?.refresh_token === originalToken) this.setSession(null);
        throw error;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }
  async signOut() {
    try { await this.auth('logout', {}); } finally { this.setSession(null); }
  }
  async request(path, { method = 'GET', body, prefer = 'return=representation', retry = true } = {}) {
    if (!this.session) throw new Error('Sign in to continue.');
    if (this.session.expires_at < Date.now() / 1000 + 60) await this.refresh();
    const res = await this.fetcher(`${this.url}/rest/v1/${path}`, {
      method, signal: AbortSignal.timeout(20000), headers: { apikey: this.key, Authorization: `Bearer ${this.session.access_token}`,
        'Content-Type': 'application/json', Prefer: prefer }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status === 401 && retry) { await this.refresh(); return this.request(path, { method, body, prefer, retry: false }); }
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(result?.message || `Request failed (${res.status}).`);
      error.definite = res.status >= 400 && res.status < 500;
      throw error;
    }
    return result;
  }
  get pendingKey() { return this.prefix + 'pending:' + this.session?.user.id; }
  get pending() { return JSON.parse(this.storage.getItem(this.pendingKey) || 'null'); }
  async mutate(operation) {
    if (this.pending) throw new Error('Resolve the pending save with “Retry pending save” first.');
    this.storage.setItem(this.pendingKey, JSON.stringify(operation));
    return this.retryPending();
  }
  async retryPending() {
    const key = this.pendingKey;
    const op = this.pending;
    if (!op) return;
    try {
      const result = await this.request(op.path, op.options);
      this.storage.removeItem(key);
      if (op.options.method === 'PATCH' && result.length === 0) throw new Error('Someone changed this record. Reopen it and review the latest values.');
      return result;
    } catch (error) {
      if (error.definite) this.storage.removeItem(key);
      throw error;
    }
  }
  async snapshot(wedding) { return this.request('rpc/budget_snapshot', { method: 'POST', body: { w: wedding } }); }
}

// Supabase's documented Phoenix JSON protocol, with polling as a fallback.
export function subscribe(api, wedding, onChange, onStatus) {
  let closed = false, heartbeat, reconnect, socket, ref = 0;
  const tables = ['weddings', 'wedding_members', 'categories', 'expenses', 'vendors', 'quotes', 'payments', 'installments', 'contract_amendments'];
  function connect() {
    if (closed || !api.session) return;
    ref = 0;
    socket = new WebSocket(`${api.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(api.key)}&vsn=1.0.0`);
    const send = (topic, event, payload) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: topic === 'phoenix' ? null : '1' }));
    socket.onopen = () => {
      send('realtime:budget', 'phx_join', { access_token: api.session.access_token,
        config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: tables.map(table => ({
          event: '*', schema: 'public', table, filter: `${table === 'weddings' ? 'id' : 'wedding_id'}=eq.${wedding}`,
        })) } });
      heartbeat = setInterval(() => send('phoenix', 'heartbeat', {}), 25000);
    };
    socket.onmessage = e => {
      const message = JSON.parse(e.data);
      if (message.event === 'postgres_changes') onChange();
      if (message.event === 'phx_reply' && message.ref === '1' && message.payload.status === 'ok') onStatus('Live updates connected');
      if (message.event === 'system' && message.payload.status === 'error') onStatus('Live updates unavailable; refreshing every 20 seconds');
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearInterval(heartbeat);
      if (!closed) { onStatus('Reconnecting; refreshing every 20 seconds'); reconnect = setTimeout(connect, 5000); }
    };
  }
  connect();
  return () => { closed = true; clearInterval(heartbeat); clearTimeout(reconnect); socket?.close(); };
}
