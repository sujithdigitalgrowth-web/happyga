import { firebaseAuth } from '../firebase.js';
import { onIdTokenChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export const AUTH_KEY = 'happyga_auth';

export function readAuthState() {
  try {
    const storedValue = localStorage.getItem(AUTH_KEY);
    return storedValue ? JSON.parse(storedValue) : null;
  } catch {
    return null;
  }
}

export function writeAuthState(authState) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(authState));
}

export function clearAuthState() {
  localStorage.removeItem(AUTH_KEY);
}

// Keep stored ID token fresh — Firebase renews it every ~1 hour
onIdTokenChanged(firebaseAuth, async (user) => {
  if (!user) return;
  const idToken = await user.getIdToken();
  const current = readAuthState();
  if (current) writeAuthState({ ...current, idToken });
});

export function buildApiHeaders(authState, extraHeaders = {}) {
  const headers = { ...extraHeaders };

  if (authState?.phone) {
    headers['x-happyga-phone'] = authState.phone;
  }

  if (authState?.mode) {
    headers['x-happyga-auth-mode'] = authState.mode;
  }

  if (authState?.idToken) {
    headers['Authorization'] = `Bearer ${authState.idToken}`;
  }

  return headers;
}