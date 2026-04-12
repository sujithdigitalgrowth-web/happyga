import { buildApiHeaders } from './auth.js';

// Production URLs first — local dev URLs last.
// The APK will try these in order and cache the first one that works.
const NATIVE_API_BASE_URLS = [
  'http://192.168.0.4:3000',          // Local WiFi — dev machine
  'https://web-production-a1c42b.up.railway.app',
  'https://happyga-api.up.railway.app',
  'http://10.0.2.2:3000',            // Android emulator → host machine
];

let nativeResolvedBaseUrl = null;

function isNativePlatform() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function getNativeBaseCandidates() {
  const candidates = [];
  if (nativeResolvedBaseUrl) candidates.push(nativeResolvedBaseUrl);
  for (const url of NATIVE_API_BASE_URLS) {
    if (!candidates.includes(url)) candidates.push(url);
  }
  return candidates.map(normalizeBaseUrl).filter(Boolean);
}

function getApiBaseUrl() {
  if (!isNativePlatform()) return '';
  return normalizeBaseUrl(nativeResolvedBaseUrl || NATIVE_API_BASE_URLS[0]);
}

function getCapacitorHttpPlugin() {
  return window.Capacitor?.Plugins?.CapacitorHttp || null;
}

function buildNativeHttpOptions(baseUrl, path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  const requestOptions = {
    url: `${baseUrl}${path}`,
    method,
    headers,
  };

  if (options.body) {
    const contentType = String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json') && typeof options.body === 'string') {
      try {
        requestOptions.data = JSON.parse(options.body);
      } catch {
        requestOptions.data = options.body;
      }
    } else {
      requestOptions.data = options.body;
    }
  }

  return requestOptions;
}

export function buildApiUrl(path) {
  return `${getApiBaseUrl()}${path}`;
}

export async function apiFetch(path, options = {}) {
  if (!isNativePlatform()) {
    return fetch(path, options);
  }

  // On native: refresh token before every authenticated request so tokens stay valid
  // even after the ~1hr Firebase expiry (Web SDK onIdTokenChanged doesn't fire on native).
  if (options.headers?.['Authorization']) {
    try {
      const { ensureFreshAuthState } = await import('./auth.js');
      const freshState = await ensureFreshAuthState();
      if (freshState?.idToken) {
        options.headers['Authorization'] = `Bearer ${freshState.idToken}`;
      }
    } catch (refreshErr) {
      console.warn('[DEBUG-API] Token refresh before request failed:', refreshErr?.message);
    }
  }

  const nativeHttp = getCapacitorHttpPlugin();
  let lastError = null;
  for (const baseUrl of getNativeBaseCandidates()) {
    try {
      console.log(`[DEBUG-API] Trying ${baseUrl}${path} (nativeHttp: ${!!nativeHttp})`);
      if (nativeHttp) {
        const response = await nativeHttp.request(buildNativeHttpOptions(baseUrl, path, options));
        console.log(`[DEBUG-API] SUCCESS via CapacitorHttp ${baseUrl}${path} — status: ${response.status}`);
        nativeResolvedBaseUrl = baseUrl;
        return response;
      }

      const response = await fetch(`${baseUrl}${path}`, options);
      console.log(`[DEBUG-API] SUCCESS via fetch ${baseUrl}${path} — status: ${response.status}`);
      nativeResolvedBaseUrl = baseUrl;
      return response;
    } catch (error) {
      console.warn(`[DEBUG-API] FAILED ${baseUrl}${path}:`, error?.message || error);
      lastError = error;
    }
  }

  console.error('[DEBUG-API] ALL base URLs failed for', path);
  throw lastError || new Error('Unable to reach backend API from Android app');
}

async function readJsonResponse(response) {
  if (response && typeof response.status === 'number' && 'data' in response && !('ok' in response)) {
    const payload = typeof response.data === 'string'
      ? (() => {
          try { return JSON.parse(response.data); } catch { return null; }
        })()
      : response.data;

    if (response.status < 200 || response.status >= 300) {
      throw new Error(payload?.error || `Request failed with status ${response.status}`);
    }

    return payload;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function fetchWallet(authState) {
  return readJsonResponse(
    await apiFetch('/api/wallet', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function rechargeWallet(authState, payload) {
  return readJsonResponse(
    await apiFetch('/api/wallet/recharge', {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    }),
  );
}

export async function startDemoCall(authState, username) {
  return readJsonResponse(
    await apiFetch('/api/calls/preflight', {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        to: username,
        listenerId: localStorage.getItem('selectedListenerId'),
        listenerName: localStorage.getItem('selectedListenerName'),
      }),
    }),
  );
}

/**
 * Triggers a real Twilio call to the matched user's registered phone.
 * Called after a successful preflight so the user's phone actually rings.
 */
export async function ringUserPhone(username) {
  return readJsonResponse(
    await apiFetch(`/api/calls/ring/${encodeURIComponent(username)}`, {
      method: 'POST',
    }),
  );
}

export async function fetchSessions(authState) {
  return readJsonResponse(
    await apiFetch('/api/sessions', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function saveSession(authState, session) {
  return readJsonResponse(
    await apiFetch('/api/sessions', {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(session),
    }),
  );
}

export async function createWithdrawal(authState, amount, upiId) {
  return readJsonResponse(
    await apiFetch('/api/withdrawals', {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ amount, upiId }),
    }),
  );
}

export async function createListenerProfile(authState, payload) {
  return readJsonResponse(
    await apiFetch('/api/listener-profile', {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    }),
  );
}

export async function getListenerProfile(authState) {
  return readJsonResponse(
    await apiFetch('/api/listener-profile', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function getWithdrawals(authState) {
  return readJsonResponse(
    await apiFetch('/api/withdrawals', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function updateListenerStatus(authState, isOnline) {
  return apiFetch('/api/listener-status', {
    method: 'POST',
    headers: buildApiHeaders(authState, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ isOnline }),
  });
}

/**
 * Sync app-call presence for the current listener.
 * status: 'ready' | 'busy' | 'offline' | 'unregistered'
 * Silently ignores errors (fire-and-forget).
 */
export async function syncListenerAppPresence(authState, status) {
  try {
    await apiFetch('/api/listener-app-presence', {
      method: 'POST',
      headers: buildApiHeaders(authState, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
    console.log('[presence] synced:', status);
  } catch (err) {
    console.warn('[presence] sync failed:', err.message);
  }
}

export async function getListeners(authState) {
  return readJsonResponse(
    await apiFetch('/api/listeners', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function getListenerSessions(authState) {
  return readJsonResponse(
    await apiFetch('/api/listener-sessions', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function getCallStatus(callSid) {
  return readJsonResponse(
    await apiFetch(`/api/calls/status/${encodeURIComponent(callSid)}`),
  );
}

export async function getTransactions(authState) {
  return readJsonResponse(
    await apiFetch('/api/wallet/transactions', {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function endCall(callSid) {
  return readJsonResponse(
    await apiFetch(`/api/calls/end/${encodeURIComponent(callSid)}`, {
      method: 'POST',
    }),
  );
}

/**
 * App-to-app call preflight: verifies balance and creates an activeCalls record
 * so the Twilio status callback can finalize billing correctly.
 */
export async function appCallPreflight(authState, { listenerUid, listenerName, callerName }) {
  return readJsonResponse(
    await apiFetch('/api/calls/app-preflight', {
      method: 'POST',
      headers: buildApiHeaders(authState, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ listenerUid, listenerName, callerName }),
    }),
  );
}