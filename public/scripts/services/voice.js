import { buildApiHeaders } from './auth.js';
import { apiFetch } from './api.js';
import { readAuthState } from './auth.js';

let voiceDevice = null;
let currentIncomingCall = null;
const wiredCalls = new WeakSet();
let isVoiceInitInProgress = false;
let isVoiceRegisterInProgress = false;

async function fetchVoiceToken() {
  const authState = readAuthState();
  if (!authState) throw new Error('Not authenticated');

  const response = await apiFetch('/api/voice/token', {
    headers: buildApiHeaders(authState),
  });

  // Handle both native (CapacitorHttp) and browser fetch responses
  if (response && typeof response.status === 'number' && 'data' in response && !('ok' in response)) {
    const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(payload?.error || `Token fetch failed with status ${response.status}`);
    }
    return payload;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Token fetch failed with status ${response.status}`);
  }
  return payload;
}

/**
 * Attach lifecycle listeners to a Twilio Call object exactly once.
 * handlers: { onRinging, onAccept, onDisconnect, onCancel, onError, onReconnecting, onReconnected }
 * Returns the call.
 */
export function wireVoiceCallLifecycle(call, handlers = {}) {
  if (!call || wiredCalls.has(call)) return call;
  wiredCalls.add(call);

  if (handlers.onRinging) call.on('ringing', handlers.onRinging);

  call.on('accept', () => {
    console.log('[Voice] Call accepted (connected)');
    handlers.onAccept?.();
  });

  call.on('disconnect', () => {
    console.log('[Voice] Call disconnected');
    if (currentIncomingCall === call) currentIncomingCall = null;
    handlers.onDisconnect?.();
  });

  call.on('cancel', () => {
    console.log('[Voice] Call cancelled');
    if (currentIncomingCall === call) currentIncomingCall = null;
    handlers.onCancel?.();
  });

  call.on('error', (error) => {
    console.error('[Voice] Call error:', error.message || error);
    if (currentIncomingCall === call) currentIncomingCall = null;
    handlers.onError?.(error);
  });

  call.on('reconnecting', (error) => {
    console.warn('[Voice] Call reconnecting:', error?.message || '');
    handlers.onReconnecting?.(error);
  });

  call.on('reconnected', () => {
    console.log('[Voice] Call reconnected');
    handlers.onReconnected?.();
  });

  return call;
}

export async function initVoiceDevice() {
  if (isVoiceInitInProgress) {
    console.log('[Voice] Init already in progress, skipping');
    return voiceDevice;
  }
  isVoiceInitInProgress = true;
  try {
    if (typeof Twilio === 'undefined' || !Twilio.Device) {
      console.warn('[Voice] Twilio SDK not loaded, skipping device init');
      return null;
    }

    const { token, identity } = await fetchVoiceToken();
    console.log('[Voice] Token received, identity:', identity);

    voiceDevice = new Twilio.Device(token, {
      logLevel: 'warn',
      codecPreferences: ['opus', 'pcmu'],
    });

    voiceDevice.on('registered', () => {
      console.log('[Voice] Device registered and ready');
      window.dispatchEvent(new CustomEvent('happyga:voice-device-online'));
    });

    voiceDevice.on('unregistered', () => {
      console.warn('[Voice] Device unregistered');
      window.dispatchEvent(new CustomEvent('happyga:voice-device-offline'));
    });

    voiceDevice.on('error', (error) => {
      console.error('[Voice] Device error:', error.message || error);
    });

    voiceDevice.on('incoming', (call) => {
      console.log('[Voice] Incoming call from:', call.parameters.From);
      currentIncomingCall = call;

      // Wire minimal cleanup listeners (UI wiring happens in main.js via wireVoiceCallLifecycle)
      call.on('cancel', () => {
        if (currentIncomingCall === call) currentIncomingCall = null;
      });
      call.on('disconnect', () => {
        if (currentIncomingCall === call) currentIncomingCall = null;
      });
      call.on('error', () => {
        if (currentIncomingCall === call) currentIncomingCall = null;
      });

      // Dispatch event for main.js to show UI
      window.dispatchEvent(new CustomEvent('happyga:incoming-call', {
        detail: {
          call,
          from: call.parameters.From || 'Unknown',
          callerName: call.customParameters?.get('callerName') || '',
          callerUid: call.customParameters?.get('callerUid') || '',
          listenerUid: call.customParameters?.get('listenerUid') || '',
        },
      }));
    });

    voiceDevice.on('tokenWillExpire', async () => {
      console.log('[Voice] Token expiring, refreshing...');
      try {
        const { token: newToken } = await fetchVoiceToken();
        voiceDevice.updateToken(newToken);
        console.log('[Voice] Token refreshed');
      } catch (err) {
        console.error('[Voice] Token refresh failed:', err.message);
      }
    });

    await voiceDevice.register();
    console.log('[Voice] Device registration initiated');
    return voiceDevice;
  } catch (err) {
    console.error('[Voice] initVoiceDevice failed:', err.message);
    return null;
  } finally {
    isVoiceInitInProgress = false;
  }
}

export function getVoiceDevice() {
  return voiceDevice;
}

/**
 * Check if the Twilio Voice device is ready to place app-to-app calls.
 */
export function isDeviceReady() {
  return voiceDevice != null && voiceDevice.state === 'registered';
}

/**
 * Return the current device state string for health checks.
 * 'registered' | 'unregistered' | 'destroyed' | 'missing'
 */
export function getDeviceState() {
  if (!voiceDevice) return 'missing';
  return voiceDevice.state;
}

/**
 * Safely attempt to re-register an existing device.
 * Returns true if device is now registered, false if recovery is needed.
 * Callers should fall back to initVoiceDevice() on false.
 */
export async function ensureDeviceRegistered() {
  if (isVoiceInitInProgress || isVoiceRegisterInProgress) {
    console.log('[Voice] Init/register already in progress, skipping');
    return false;
  }

  if (!voiceDevice) {
    console.log('[Voice] No device exists — caller should initVoiceDevice()');
    return false;
  }

  const state = voiceDevice.state;
  if (state === 'registered') return true;
  if (state === 'destroyed') return false;

  isVoiceRegisterInProgress = true;
  try {
    console.log('[Voice] Re-registering device (state was:', state + ')');
    await voiceDevice.register();
    return true;
  } catch (err) {
    console.warn('[Voice] Re-register failed:', err.message);
    return false;
  } finally {
    isVoiceRegisterInProgress = false;
  }
}

/**
 * Determine whether an app-to-app voice call can be placed to a given profile.
 * Requires: profile with an id, and a registered Twilio Device.
 */
export function canUseVoiceAppCall(profile) {
  if (!profile || !profile.id) return false;
  return isDeviceReady();
}

/**
 * Convert any uid into the same Twilio-safe identity format used on the backend.
 * Only A-Z a-z 0-9 underscore, max 121 chars (Twilio identity limit).
 */
export function toTwilioIdentity(uid) {
  return String(uid || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 121);
}

/**
 * Start an outgoing app-to-app voice call to target identity via the Twilio Device.
 * Returns the Twilio Call object, or null if device is not ready.
 */
export async function startVoiceCall(targetIdentity, extraParams = {}) {
  if (!voiceDevice) {
    console.error('[Voice] Cannot start call — device not initialized');
    return null;
  }

  console.log('[Voice] Starting app-to-app call to:', targetIdentity);

  const call = await voiceDevice.connect({
    params: { To: targetIdentity, ...extraParams },
  });

  return call;
}

export function getCurrentIncomingCall() {
  return currentIncomingCall;
}

export function acceptIncomingCall() {
  if (!currentIncomingCall) {
    console.warn('[Voice] No incoming call to accept');
    return null;
  }
  console.log('[Voice] Accepting incoming call');
  currentIncomingCall.accept();
  return currentIncomingCall;
}

export function rejectIncomingCall() {
  if (!currentIncomingCall) {
    console.warn('[Voice] No incoming call to reject');
    return;
  }
  console.log('[Voice] Rejecting incoming call');
  currentIncomingCall.reject();
  currentIncomingCall = null;
}

export function clearIncomingCall() {
  currentIncomingCall = null;
}
