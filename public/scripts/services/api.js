import { buildApiHeaders } from './auth.js';

const NATIVE_API_BASE_URLS = [
  'http://192.168.1.179:3000',
  'http://192.168.0.5:3000',
  'http://10.0.2.2:3000',
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

export function buildApiUrl(path) {
  return `${getApiBaseUrl()}${path}`;
}

export async function apiFetch(path, options = {}) {
  if (!isNativePlatform()) {
    return fetch(path, options);
  }

  let lastError = null;
  for (const baseUrl of getNativeBaseCandidates()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      nativeResolvedBaseUrl = baseUrl;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to reach backend API from Android app');
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