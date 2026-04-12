import { firebaseAuth } from '../firebase.js';
import { onIdTokenChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export const AUTH_KEY = 'happyga_auth';

function isNativePlatform() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function getNativeFirebaseAuthPlugin() {
  return window.Capacitor?.Plugins?.FirebaseAuthentication || null;
}

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

// Keep stored ID token fresh — Firebase renews it every ~1 hour.
// This listener works for WEB logins only. Native logins are handled by refreshNativeToken().
onIdTokenChanged(firebaseAuth, async (user) => {
  console.log('[DEBUG-AUTH-STATE] onIdTokenChanged fired — user:', user ? `uid=${user.uid}` : 'NULL (no web SDK session)');
  if (!user) return;
  const idToken = await user.getIdToken();
  const current = readAuthState();
  if (current) writeAuthState({ ...current, idToken });
});

/**
 * Refresh ID token using the native Capacitor Firebase plugin.
 * Called before authenticated API requests on Android so tokens stay fresh
 * even though the Web SDK onIdTokenChanged never fires for native auth.
 * Returns the (possibly refreshed) auth state.
 */
export async function ensureFreshAuthState() {
  const authState = readAuthState();
  if (!authState) return null;

  // Only needed on native platform with firebase auth mode
  if (!isNativePlatform() || authState.mode !== 'firebase') return authState;

  const nativeAuth = getNativeFirebaseAuthPlugin();
  if (!nativeAuth) return authState;

  try {
    // forceRefresh: false lets the SDK return cached token if still valid (<5 min to expiry),
    // or auto-refresh if close to expiry. This is cheap and avoids unnecessary network calls.
    const tokenResult = await nativeAuth.getIdToken({ forceRefresh: false });
    if (tokenResult?.token && tokenResult.token !== authState.idToken) {
      console.log('[DEBUG-AUTH-STATE] Native token refreshed — new length:', tokenResult.token.length);
      const updated = { ...authState, idToken: tokenResult.token };
      writeAuthState(updated);
      return updated;
    }
  } catch (err) {
    console.warn('[DEBUG-AUTH-STATE] Native token refresh failed:', err?.message || err);
    // Fall through — use existing token; backend will reject if expired
  }

  return authState;
}

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