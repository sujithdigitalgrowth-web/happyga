import { buildApiHeaders } from './auth.js';

const NATIVE_API_BASE_URL = 'http://192.168.0.5:3000';

function getApiBaseUrl() {
  return window.Capacitor?.isNativePlatform?.() ? NATIVE_API_BASE_URL : '';
}

export function buildApiUrl(path) {
  return `${getApiBaseUrl()}${path}`;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function fetchWallet(authState) {
  return readJsonResponse(
    await fetch(buildApiUrl('/api/wallet'), {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function rechargeWallet(authState, payload) {
  return readJsonResponse(
    await fetch(buildApiUrl('/api/wallet/recharge'), {
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
    await fetch(buildApiUrl('/api/calls/preflight'), {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ to: username }),
    }),
  );
}

/**
 * Triggers a real Twilio call to the matched user's registered phone.
 * Called after a successful preflight so the user's phone actually rings.
 */
export async function ringUserPhone(username) {
  return readJsonResponse(
    await fetch(buildApiUrl(`/api/calls/ring/${encodeURIComponent(username)}`), {
      method: 'POST',
    }),
  );
}

export async function fetchSessions(authState) {
  return readJsonResponse(
    await fetch(buildApiUrl('/api/sessions'), {
      headers: buildApiHeaders(authState),
    }),
  );
}

export async function saveSession(authState, session) {
  return readJsonResponse(
    await fetch(buildApiUrl('/api/sessions'), {
      method: 'POST',
      headers: buildApiHeaders(authState, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(session),
    }),
  );
}