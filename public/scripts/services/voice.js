import { buildApiHeaders } from './auth.js';
import { apiFetch } from './api.js';
import { readAuthState } from './auth.js';

let voiceDevice = null;
let currentIncomingCall = null;
const wiredCalls = new WeakSet();
let isVoiceInitInProgress = false;
let isVoiceRegisterInProgress = false;
let nativePushRegistered = false;

/** Detect if running inside Capacitor on Android */
function isNativeAndroid() {
  return Boolean(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() === 'android');
}

/** Get reference to the native TwilioVoice Capacitor plugin */
function getNativePlugin() {
  return window.Capacitor?.Plugins?.TwilioVoice || null;
}

async function fetchVoiceToken() {
  const authState = readAuthState();
  if (!authState) throw new Error('Not authenticated');

  // Pass platform hint so backend can include push credential SID for Android
  const platform = isNativeAndroid() ? 'android' : 'web';
  const response = await apiFetch(`/api/voice/token?platform=${platform}`, {
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

    // On Android, also register for native push notifications so
    // incoming calls work when the app is backgrounded/closed
    if (isNativeAndroid()) {
      registerNativePush().catch(err => {
        console.warn('[Voice] Native push registration deferred:', err.message || err);
      });
      setupNativeCallListeners();
    }

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Native Android push registration (Twilio Voice SDK)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Register the Android device's FCM token with Twilio so it can receive
 * push notifications for incoming calls even when the app is backgrounded.
 *
 * Should be called after initVoiceDevice() succeeds on Android.
 * Uses the same access token from fetchVoiceToken().
 */
export async function registerNativePush() {
  if (!isNativeAndroid()) return;
  if (nativePushRegistered) {
    console.log('[Voice] Native push already registered, skipping');
    return;
  }

  const plugin = getNativePlugin();
  if (!plugin) {
    console.warn('[Voice] TwilioVoice native plugin not available');
    return;
  }

  try {
    const { token } = await fetchVoiceToken();
    console.log('[Voice] Registering native push with Twilio...');
    await plugin.registerForCalls({ accessToken: token });
    nativePushRegistered = true;
    console.log('[Voice] Native push registration successful');
  } catch (err) {
    console.error('[Voice] Native push registration failed:', err.message || err);
  }
}

/**
 * Set up listeners for native Twilio Voice plugin events.
 * These bridge native incoming call events into the same custom event
 * system used by the web Twilio.Device, so main.js can handle both
 * web and native incoming calls uniformly.
 */
export function setupNativeCallListeners() {
  if (!isNativeAndroid()) return;

  const plugin = getNativePlugin();
  if (!plugin) return;

  console.log('[Voice] Setting up native call event listeners');

  // Incoming call received via native push (app was backgrounded)
  plugin.addListener('incomingCall', (data) => {
    console.log('[Voice] Native incoming call:', data);
    window.dispatchEvent(new CustomEvent('happyga:native-incoming-call', {
      detail: {
        from: data.from || 'Unknown',
        callerName: data.callerName || '',
        callerUid: data.callerUid || '',
        listenerUid: data.listenerUid || '',
        callSid: data.callSid || '',
        isNative: true,
      },
    }));
  });

  // Call accepted (either from notification tap or JS acceptCall)
  plugin.addListener('callAccepted', (data) => {
    console.log('[Voice] Native call accepted:', data);
    window.dispatchEvent(new CustomEvent('happyga:native-call-accepted', {
      detail: { callSid: data.callSid || '', isNative: true },
    }));
  });

  // Call disconnected
  plugin.addListener('callDisconnected', (data) => {
    console.log('[Voice] Native call disconnected:', data);
    window.dispatchEvent(new CustomEvent('happyga:native-call-disconnected', {
      detail: { callSid: data.callSid || '', error: data.error || null, isNative: true },
    }));
  });

  // Call failed
  plugin.addListener('callFailed', (data) => {
    console.error('[Voice] Native call failed:', data);
    window.dispatchEvent(new CustomEvent('happyga:native-call-failed', {
      detail: { callSid: data.callSid || '', error: data.error || 'Unknown error', isNative: true },
    }));
  });

  // Check if there's already a pending call invite (app launched from notification)
  plugin.checkIncomingCall().then((result) => {
    if (result.hasIncoming) {
      console.log('[Voice] Pending native incoming call found:', result);
      window.dispatchEvent(new CustomEvent('happyga:native-incoming-call', {
        detail: {
          from: result.from || 'Unknown',
          callerName: result.callerName || '',
          callerUid: result.callerUid || '',
          listenerUid: result.listenerUid || '',
          callSid: result.callSid || '',
          isNative: true,
        },
      }));
    }
  }).catch(err => {
    console.warn('[Voice] checkIncomingCall failed:', err);
  });
}

/**
 * Accept a native incoming call (called from UI).
 */
export async function acceptNativeCall() {
  const plugin = getNativePlugin();
  if (!plugin) return null;
  try {
    const result = await plugin.acceptCall();
    console.log('[Voice] Native call accepted via JS:', result);
    return result;
  } catch (err) {
    console.error('[Voice] Failed to accept native call:', err);
    return null;
  }
}

/**
 * Reject a native incoming call (called from UI).
 */
export async function rejectNativeCall() {
  const plugin = getNativePlugin();
  if (!plugin) return;
  try {
    await plugin.rejectCall();
    console.log('[Voice] Native call rejected via JS');
  } catch (err) {
    console.error('[Voice] Failed to reject native call:', err);
  }
}

/**
 * Hang up the active native call.
 */
export async function hangupNativeCall() {
  const plugin = getNativePlugin();
  if (!plugin) return;
  try {
    await plugin.hangup();
    console.log('[Voice] Native call hung up via JS');
  } catch (err) {
    console.error('[Voice] Failed to hangup native call:', err);
  }
}
