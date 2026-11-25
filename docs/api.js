const RESET_LINK_ERROR = 'This sign-in or reset link is invalid or expired. Request a new password reset email.';

function isClientRejection(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// Consume secrets immediately; budget anchors such as #expenses are left alone.
export function takeAuthRedirect(location, history) {
  const url = new URL(location.href);
  const parameters = new URLSearchParams(url.hash.slice(1));
  const keys = ['access_token', 'refresh_token', 'type', 'error', 'error_code', 'error_description'];
  const hasCode = url.searchParams.has('code');
  const hasError = url.searchParams.has('error') || url.searchParams.has('error_code');
  if (!hasCode && !hasError && !keys.some(key => parameters.has(key))) return null;
  if (hasCode || hasError) parameters.set('error', 'unsupported_or_expired_link');
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  url.hash = '';
  history.replaceState(null, '', url.pathname + url.search);
  return parameters;
}

export class Api {
  constructor(config, storage = sessionStorage, fetcher = globalThis.fetch.bind(globalThis)) {
    this.url = config.supabaseUrl.replace(/\/$/, '');
    this.key = config.publishableKey;
    this.storage = storage;
    this.fetcher = fetcher;
    this.prefix = `wedding:${this.url}:`;
    this.session = JSON.parse(storage.getItem(this.prefix + 'session') || 'null');
    this.pendingRequests = new Map();
  }
  setSession(session) {
    this.session = session;
    if (session) this.storage.setItem(this.prefix + 'session', JSON.stringify(session));
    else this.storage.removeItem(this.prefix + 'session');
    this.onSession?.();
  }
  async auth(path, body, { method = 'POST', accessToken } = {}) {
    const token = accessToken || (path === 'logout' ? this.session?.access_token : null);
    const res = await this.fetcher(`${this.url}/auth/v1/${path}`, {
      method, headers: { apikey: this.key, 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(result.msg || result.error_description || result.message || 'Sign-in request failed.');
      error.status = res.status;
      throw error;
    }
    return result;
  }
  async signIn(email, password) {
    const s = await this.auth('token?grant_type=password', { email, password });
    this.setSession({ ...s, expires_at: Math.floor(Date.now() / 1000) + s.expires_in });
  }
  async registerInvited(email,password,invitation,returnUrl) {
    await this.auth(`signup?redirect_to=${encodeURIComponent(returnUrl)}`, {
      email,password,data:{planner_invitation:invitation}
    });
  }
  async requestPasswordReset(email, returnUrl) {
    await this.auth(`recover?redirect_to=${encodeURIComponent(returnUrl)}`, { email });
  }
  async acceptAuthRedirect(parameters) {
    const accessToken = parameters.get('access_token');
    const refreshToken = parameters.get('refresh_token');
    const expiresIn = Number(parameters.get('expires_in'));
    const type = parameters.get('type');
    if (parameters.has('error') || !accessToken || !refreshToken || !Number.isInteger(expiresIn)
      || expiresIn <= 0 || expiresIn > 86400 || !['recovery', 'invite', 'signup', 'magiclink'].includes(type)) {
      throw new Error(RESET_LINK_ERROR);
    }
    let user;
    try { user = await this.auth('user', undefined, { method: 'GET', accessToken }); }
    catch (error) {
      if (isClientRejection(error.status)) throw new Error(RESET_LINK_ERROR);
      throw new Error('Could not verify the email link. Check your connection and reopen the link.');
    }
    if (!user?.id) throw new Error(RESET_LINK_ERROR);
    this.setSession({ user, access_token: accessToken, refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn, recovery: type === 'recovery' || type === 'invite' });
  }
  async updatePassword(password) {
    if (!this.session) throw new Error('Open a fresh password reset link before choosing a password.');
    const userId = this.session.user.id;
    if (this.session.expires_at < Date.now() / 1000 + 60) await this.refresh();
    const accessToken = this.#accessTokenFor(userId);
    const user = await this.auth('user', { password }, { method: 'PUT', accessToken });
    if (this.session?.access_token === accessToken) this.setSession({ ...this.session, user, recovery: false });
  }
  async refresh() {
    if (!this.session) throw new Error('Sign in to continue.');
    if (!this.refreshing) this.refreshing = (async () => {
      const originalToken = this.session?.refresh_token;
      try {
        const s = await this.auth('token?grant_type=refresh_token', { refresh_token: originalToken });
        if (this.session?.refresh_token === originalToken) this.setSession({ ...s, recovery: !!this.session.recovery, expires_at: Math.floor(Date.now() / 1000) + s.expires_in });
      } catch (error) {
        // Auth can report a conflict when another client is renewing the same session.
        if (isClientRejection(error.status) && error.status !== 409 && this.session?.refresh_token === originalToken) {
          this.setSession(null);
        }
        throw error;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }
  async signOut() {
    const accessToken=this.session?.access_token;
    this.setSession(null);
    if (accessToken) await this.auth('logout', {}, {accessToken});
  }
  #accessTokenFor(userId) {
    if (this.session?.user.id !== userId) throw new Error('The signed-in account changed. Reopen the planner and try again.');
    return this.session.access_token;
  }
  async #authenticatedFetch(path, options, {retry, timeoutMs}) {
    if (!this.session) throw new Error('Sign in to continue.');
    const userId = this.session.user.id;
    const send = token => this.fetcher(this.url + path, {
      ...options,
      headers: {...options.headers, apikey: this.key, Authorization: `Bearer ${token}`},
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (this.session.expires_at < Date.now() / 1000 + 60) await this.refresh();
    const token = this.#accessTokenFor(userId);
    const res = await send(token);
    if (res.status !== 401 || !retry) return res;
    // A concurrent request may have renewed the token while this one was in flight.
    if (this.#accessTokenFor(userId) === token) await this.refresh();
    return send(this.#accessTokenFor(userId));
  }
  async request(path, { method = 'GET', body, prefer = 'return=representation', retry = true } = {}) {
    const res = await this.#authenticatedFetch(`/rest/v1/${path}`, {
      method, headers: {'Content-Type': 'application/json', Prefer: prefer}, body: JSON.stringify(body),
    }, {retry, timeoutMs: 20000});
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(result?.message || `Request failed (${res.status}).`);
      error.code = result?.code;
      // Only a rejection from the data endpoint can discard a saved operation.
      error.discardPending = isClientRejection(res.status) && res.status !== 401;
      throw error;
    }
    return result;
  }
  get pendingKey() { return this.prefix + 'pending:' + this.session?.user.id; }
  get pending() { return JSON.parse(this.storage.getItem(this.pendingKey) || 'null'); }
  async mutate(operation) {
    if (!this.session) throw new Error('Sign in to continue.');
    if (this.pending) throw new Error('Resolve the pending save with “Retry pending save” first.');
    this.storage.setItem(this.pendingKey, JSON.stringify(operation));
    return this.retryPending();
  }
  async retryPending() {
    const key = this.pendingKey;
    if (this.pendingRequests.has(key)) return this.pendingRequests.get(key);
    const op = this.pending;
    if (!op) return;
    const request = this.#submitPending(key, op);
    this.pendingRequests.set(key, request);
    return request;
  }
  async #submitPending(key, op) {
    try {
      const result = await this.request(op.path, op.options);
      this.storage.removeItem(key);
      if (op.options.method === 'PATCH' && result.length === 0) throw new Error('Someone changed this record. Reopen it and review the latest values.');
      return result;
    } catch (error) {
      if (error.discardPending) this.storage.removeItem(key);
      throw error;
    } finally {
      this.pendingRequests.delete(key);
    }
  }
  async snapshot(wedding) { return this.request('rpc/budget_snapshot', { method: 'POST', body: { w: wedding } }); }
  async photo(path, {file, retry = true, bucket = 'vendor-photos'} = {}) {
    if (!['vendor-photos', 'menu-photos'].includes(bucket)) throw new Error('Unsupported photo bucket.');
    const objectPath = path.split('/').map(encodeURIComponent).join('/');
    const endpoint = `/storage/v1/object/${file ? '' : 'authenticated/'}${bucket}/${objectPath}`;
    const options = file
      ? {method: 'POST', headers: {'Content-Type': file.type, 'x-upsert': 'true'}, body: file}
      : {method: 'GET'};
    const res = await this.#authenticatedFetch(endpoint, options, {retry, timeoutMs: 30000});
    if (!res.ok) {
      const error = await res.json().catch(() => null);
      throw new Error(error?.message || 'Photo could not be loaded or uploaded. Try again.');
    }
    return file ? res.json() : res.blob();
  }
}

// Supabase's documented Phoenix JSON protocol, with polling as a fallback.
export function subscribe(api, wedding, onChange, onStatus, includePlanner = false, includeFeedback = false, includeItinerary = false, includeMenu = false, includeSeating = false) {
  let closed = false, heartbeat, reconnect, socket, ref = 0;
  const tables = ['weddings', 'wedding_members', 'categories', 'expenses', 'vendors', 'quotes', 'payments', 'installments', 'contract_amendments'];
  if (includePlanner) tables.push('invitations', 'guests', 'tasks');
  if (includeFeedback) tables.push('events','vendor_photos');
  if (includeItinerary) tables.push('itinerary_items');
  if (includeSeating) tables.push('seating_changes');
  if (includeMenu) tables.push('menu_courses','menu_options','guest_meals');
  function connect() {
    if (closed || !api.session) return;
    ref = 0;
    socket = new WebSocket(`${api.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(api.key)}&vsn=1.0.0`);
    const send = (topic, event, payload) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: topic === 'phoenix' ? null : '1' }));
    socket.onopen = () => {
      if (closed || !api.session) return;
      send('realtime:budget', 'phx_join', { access_token: api.session.access_token,
        config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: tables.map(table => ({
          event: '*', schema: 'public', table, filter: `${table === 'weddings' ? 'id' : 'wedding_id'}=eq.${wedding}`,
        })) } });
      heartbeat = setInterval(() => send('phoenix', 'heartbeat', {}), 25000);
    };
    socket.onmessage = e => {
      if (closed) return;
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
