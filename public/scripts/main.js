import { createBottomNav } from './components/bottom-nav.js';
import { createCoinsModal } from './components/coins-modal.js';
import { initRandomCallButton } from './components/random-call-button.js';
import { createHomePage } from './pages/home-page.js';
import { createProfilePage } from './pages/profile-page.js';
import { createSessionsPage } from './pages/sessions-page.js';
import { loadFragments } from './shared/fragment-loader.js';
import { clearAuthState, readAuthState } from './services/auth.js';
import { initVoiceDevice, startVoiceCall, toTwilioIdentity, acceptIncomingCall, rejectIncomingCall, wireVoiceCallLifecycle, clearIncomingCall, canUseVoiceAppCall, isDeviceReady, getDeviceState, ensureDeviceRegistered } from './services/voice.js';
import { firebaseAuth } from './firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  fetchSessions,
  fetchWallet,
  rechargeWallet,
  startDemoCall,
  getCallStatus,
  endCall,
  syncListenerAppPresence,
  appCallPreflight,
} from './services/api.js';

async function init() {
  await loadFragments();

  const authState = readAuthState();
  const rootStyle = document.documentElement.style;
  const phoneShell = document.querySelector('.phone-shell');
  const topbar = document.querySelector('.topbar');
  const bottomNavElement = document.querySelector('.bottom-nav');
  const profilesList = document.getElementById('profilesList');
  const sessionsList = document.getElementById('sessionsList');
  const navButtons = Array.from(document.querySelectorAll('.nav-item'));
  const viewPanels = Array.from(document.querySelectorAll('.view-panel'));
  const walletBalanceText = document.getElementById('walletBalanceText');
  const callStatusText = document.getElementById('callStatusText');
  const profileForm = document.getElementById('profileForm');
  const listenerForm = document.getElementById('listenerForm');
  const profileSummaryText = document.getElementById('profileSummaryText');
  const personalDetailsBtn = document.getElementById('personalDetailsBtn');
  const listenerProfileBtn = document.getElementById('listenerProfileBtn');
  const referFriendBtn = document.getElementById('referFriendBtn');
  const copyReferralBtn = document.getElementById('copyReferralBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const detailsModal = document.getElementById('detailsModal');
  const listenerModal = document.getElementById('listenerModal');
  const referModal = document.getElementById('referModal');
  const modalCloseButtons = Array.from(document.querySelectorAll('.modal-close-btn'));
  const coinsBtn = document.getElementById('coinsBtn');
  const coinsModal = document.getElementById('coinsModal');
  const closeCoinsBtn = document.getElementById('closeCoinsBtn');
  const rechargeHint = document.getElementById('rechargeHint');
  const planButtons = Array.from(document.querySelectorAll('.coin-pack'));
  const selectedPlanText = document.getElementById('selectedPlanText');
  const buyNowBtn = document.getElementById('buyNowBtn');
  const randomCallBtn = document.getElementById('randomCallBtn');
  const coinsModalCard = document.querySelector('.coins-modal');
  const callScreenModal = document.getElementById('callScreenModal');
  const callScreenTitle = document.getElementById('callScreenTitle');
  const callScreenStatus = document.getElementById('callScreenStatus');
  const callScreenNote = document.getElementById('callScreenNote');
  const callScreenCloseBtn = document.getElementById('callScreenCloseBtn');
  const callScreenBuyBtn = document.getElementById('callScreenBuyBtn');

  const callScreenTimer = document.getElementById('callScreenTimer');
  const callScreenSummary = document.getElementById('callScreenSummary');
  const incomingCallActions = document.getElementById('incomingCallActions');
  const incomingAcceptBtn = document.getElementById('incomingAcceptBtn');
  const incomingRejectBtn = document.getElementById('incomingRejectBtn');
  const inCallControls = document.getElementById('inCallControls');
  const muteBtn = document.getElementById('muteBtn');
  const speakerBtn = document.getElementById('speakerBtn');

  // --- Call config ---
  const ENABLE_PSTN_FALLBACK = false; // Set true only for debugging / emergency PSTN fallback

  // --- Normalized active call state ---
  // Single source of truth for the current call lifecycle.
  let activeCall = {
    transport: null,       // 'voice-client' | 'pstn' | null
    tempCallId: null,      // backend-generated ID from app-preflight
    twilioCallSid: null,   // real Twilio CallSid (set when known)
    listenerUid: null,
    listenerName: null,
    status: 'idle',        // idle | calling | ringing | connected | ended | failed
    voiceCall: null,       // Twilio Call object (Voice SDK)
    muted: false,          // current mute state
  };

  function resetActiveCall() {
    activeCall = {
      transport: null, tempCallId: null, twilioCallSid: null,
      listenerUid: null, listenerName: null, status: 'idle', voiceCall: null,
      muted: false,
    };
  }

  /**
   * Debug helper — logs active call state in one place.
   * Usage: logCallState('event-name') at key lifecycle points.
   */
  function logCallState(label) {
    console.log(`[call-state] ${label}`, {
      status: activeCall.status,
      transport: activeCall.transport,
      tempCallId: activeCall.tempCallId,
      twilioCallSid: activeCall.twilioCallSid,
      listenerUid: activeCall.listenerUid,
      listenerName: activeCall.listenerName,
      hasVoiceCall: !!activeCall.voiceCall,
    });
  }

  // --- Call timer & polling (display only — billing uses server duration) ---
  let callTimerInterval = null;
  let callTimerSeconds = 0;
  let callPollInterval = null; // Legacy PSTN polling only
  let endStateAutoCloseId = null; // Auto-close timer after end states

  function updateOverlayBounds() {
    if (!phoneShell || !topbar || !bottomNavElement) return;

    const shellRect = phoneShell.getBoundingClientRect();
    const topbarRect = topbar.getBoundingClientRect();
    const bottomNavRect = bottomNavElement.getBoundingClientRect();

    // backdrop-filter on .phone-shell.card makes position:fixed relative
    // to the shell, so compute overlay bounds relative to the shell, not viewport.
    rootStyle.setProperty('--app-overlay-top', `${Math.max(topbarRect.bottom - shellRect.top, 0)}px`);
    rootStyle.setProperty('--app-overlay-right', `${0}px`);
    rootStyle.setProperty('--app-overlay-bottom', `${Math.max(shellRect.bottom - bottomNavRect.top, 0)}px`);
    rootStyle.setProperty('--app-overlay-left', `${0}px`);
    rootStyle.setProperty('--app-overlay-width', `${Math.max(shellRect.width, 0)}px`);
  }

  updateOverlayBounds();
  window.addEventListener('resize', updateOverlayBounds);
  window.addEventListener('orientationchange', updateOverlayBounds);
  window.visualViewport?.addEventListener('resize', updateOverlayBounds);

  function formatTimer(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function startCallTimer() {
    callTimerSeconds = 0;
    if (callScreenTimer) {
      callScreenTimer.textContent = '00:00';
      callScreenTimer.classList.remove('hidden');
    }
    callTimerInterval = setInterval(() => {
      callTimerSeconds++;
      if (callScreenTimer) callScreenTimer.textContent = formatTimer(callTimerSeconds);
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  }

  function stopCallPolling() {
    if (callPollInterval) { clearInterval(callPollInterval); callPollInterval = null; }
  }

  function clearEndStateAutoClose() {
    if (endStateAutoCloseId) { clearTimeout(endStateAutoCloseId); endStateAutoCloseId = null; }
  }

  function scheduleEndStateAutoClose(delayMs = 2000) {
    clearEndStateAutoClose();
    endStateAutoCloseId = setTimeout(() => {
      endStateAutoCloseId = null;
      closeCallScreen();
    }, delayMs);
  }

  /**
   * Centralized helper — set disabled/loading for call action buttons.
   */
  function setCallActionState({ acceptDisabled, rejectDisabled, endDisabled } = {}) {
    if (incomingAcceptBtn) incomingAcceptBtn.disabled = !!acceptDisabled;
    if (incomingRejectBtn) incomingRejectBtn.disabled = !!rejectDisabled;
    if (callScreenCloseBtn) callScreenCloseBtn.disabled = !!endDisabled;
  }

  function setCallState(newState, extra = {}) {
    activeCall.status = newState;
    logCallState(`setCallState → ${newState}`);
    if (!callScreenStatus || !callScreenNote) return;

    // Reset classes
    callScreenStatus.className = 'call-screen-status';
    if (callScreenSummary) callScreenSummary.classList.add('hidden');
    callScreenBuyBtn?.classList.add('hidden');

    // Toggle incoming vs outgoing action buttons
    const isIncoming = newState === 'incoming-ringing';
    const isTerminal = newState === 'ended' || newState === 'failed';
    if (incomingCallActions) incomingCallActions.classList.toggle('hidden', !isIncoming);
    if (callScreenCloseBtn) callScreenCloseBtn.parentElement.classList.toggle('hidden', isIncoming || isTerminal);

    // Timer: visible only when connected/reconnecting/ended-with-duration
    const timerVisible = newState === 'connected' || (newState === 'ended' && (extra.durationSeconds || callTimerSeconds) > 0);
    if (callScreenTimer) callScreenTimer.classList.toggle('hidden', !timerVisible);

    // Show/hide in-call controls (mute, speaker)
    updateInCallControls(newState);

    // Button states
    setCallActionState({
      acceptDisabled: isTerminal,
      rejectDisabled: isTerminal,
      endDisabled: isTerminal,
    });

    switch (newState) {
      case 'incoming-ringing':
        callScreenStatus.textContent = 'Incoming call';
        callScreenStatus.classList.add('is-calling');
        callScreenNote.textContent = extra.note || 'Tap Accept to answer.';
        break;
      case 'calling':
        callScreenStatus.textContent = 'Calling...';
        callScreenStatus.classList.add('is-calling');
        callScreenNote.textContent = 'Connecting...';
        startOutgoingRingback();
        break;
      case 'ringing':
        callScreenStatus.textContent = 'Ringing...';
        callScreenStatus.classList.add('is-calling');
        callScreenNote.textContent = extra.note || 'Waiting for answer.';
        startOutgoingRingback();
        break;
      case 'connected':
        stopOutgoingRingback();
        callScreenStatus.textContent = 'Connected';
        callScreenStatus.classList.add('is-connected');
        callScreenNote.textContent = '1 coin per 10 seconds';
        break;
      case 'ended':
        stopOutgoingRingback();
        stopCallTimer();
        stopCallPolling();
        callScreenStatus.textContent = 'Call ended';
        callScreenStatus.classList.add('is-ended');
        callScreenNote.textContent = '';
        if (callScreenTimer && (extra.durationSeconds || callTimerSeconds) > 0) {
          callScreenTimer.textContent = formatTimer(extra.durationSeconds || callTimerSeconds);
        }
        if (callScreenSummary) {
          const dur = extra.durationSeconds || callTimerSeconds;
          const coins = extra.chargedCoins ?? Math.ceil(dur / 10);
          const parts = [`Duration: ${formatTimer(dur)}`, `Charged: ${coins} coin${coins !== 1 ? 's' : ''}`];
          if (extra.endedDueToLowBalance) parts.push('(ended — low balance)');
          callScreenSummary.textContent = parts.join('  •  ');
          callScreenSummary.classList.remove('hidden');
        }
        scheduleEndStateAutoClose();
        break;
      case 'failed':
        stopOutgoingRingback();
        stopCallTimer();
        stopCallPolling();
        callScreenStatus.textContent = extra.statusLabel || 'Connection failed';
        callScreenStatus.classList.add('is-busy');
        callScreenNote.textContent = extra.note || 'Try again later.';
        if (extra.showBuy) callScreenBuyBtn?.classList.remove('hidden');
        if (!extra.showBuy) scheduleEndStateAutoClose();
        break;
    }
  }

  function terminateTwilioCall() {
    const sid = activeCall.tempCallId || activeCall.twilioCallSid;
    if (sid) {
      endCall(sid).catch((err) => console.warn('endCall failed:', err));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Legacy PSTN polling — only used when ENABLE_PSTN_FALLBACK ──
  // ═══════════════════════════════════════════════════════════════
  function startCallPolling(callSid) {
    activeCall.twilioCallSid = callSid;
    let wasConnected = false;

    callPollInterval = setInterval(async () => {
      try {
        const s = await getCallStatus(callSid);

        if (s.status === 'in-progress' && activeCall.status !== 'connected') {
          wasConnected = true;
          setCallState('connected');
          startCallTimer();
        }

        if (s.finalized) {
          if (s.answered && s.durationSeconds > 0) {
            setCallState('ended', {
              durationSeconds: s.durationSeconds,
              chargedCoins: s.chargedCoins,
              endedDueToLowBalance: s.endedDueToLowBalance,
            });
          } else {
            const labels = { busy: 'Busy', 'no-answer': 'Not available', failed: 'Call failed', canceled: 'Canceled' };
            setCallState('failed', {
              statusLabel: labels[s.finalStatus] || 'Call ended',
              note: s.finalStatus === 'busy' ? 'This listener is on another call.' : 'Could not connect.',
            });
          }
          return;
        }

        const terminalStatuses = new Set(['busy', 'no-answer', 'failed', 'canceled']);
        if (terminalStatuses.has(s.status) && activeCall.status !== 'failed' && activeCall.status !== 'ended') {
          terminateTwilioCall();
          const labels = { busy: 'Busy', 'no-answer': 'Not available', failed: 'Call failed', canceled: 'Canceled' };
          setCallState('failed', {
            statusLabel: labels[s.status] || 'Call ended',
            note: s.status === 'busy' ? 'This listener is on another call.' : 'Could not connect.',
          });
        }

        if (s.status === 'completed' && activeCall.status !== 'ended' && activeCall.status !== 'failed') {
          terminateTwilioCall();
          if (wasConnected || s.answered) {
            setCallState('ended', {
              durationSeconds: s.durationSeconds || callTimerSeconds,
              chargedCoins: s.chargedCoins || Math.ceil((s.durationSeconds || callTimerSeconds) / 10),
              endedDueToLowBalance: s.endedDueToLowBalance,
            });
          } else {
            setCallState('failed', { statusLabel: 'Not available', note: 'Could not connect.' });
          }
        }
      } catch (pollErr) {
        console.warn('[poll] error:', pollErr);
      }
    }, 1500);
  }
  // ── End legacy PSTN polling ──────────────────────────────────

  let walletState = {
    balance: 0,
    storage: 'memory',
  };

  function updateWalletUi(wallet) {
    walletState = {
      ...walletState,
      ...wallet,
    };

    walletBalanceText.textContent = `${walletState.balance} coins available`;
    callStatusText.textContent = 'Minimum 1 coin needed to start. After answer, 1 coin is charged per 10 seconds.';

    const coinsBadge = document.getElementById('coinsBadge');
    if (coinsBadge) coinsBadge.textContent = walletState.balance;

    const rechargeHint = document.getElementById('rechargeHint');
    if (rechargeHint) {
      rechargeHint.classList.toggle('visible', walletState.balance === 0);
    }
  }

  // ── Incoming call ringtone (programmatic — no audio file needed) ──
  const INCOMING_CALL_TIMEOUT_MS = 25000;
  let incomingCallTimeoutId = null;
  let ringtoneCtx = null;
  let ringtoneInterval = null;

  function startIncomingRingtone() {
    stopIncomingRingtone();
    try {
      ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Play a short double-beep tone every 2 s to simulate ringing
      function playTone() {
        if (!ringtoneCtx || ringtoneCtx.state === 'closed') return;
        const now = ringtoneCtx.currentTime;
        for (let i = 0; i < 2; i++) {
          const osc = ringtoneCtx.createOscillator();
          const gain = ringtoneCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = i === 0 ? 440 : 480;
          gain.gain.setValueAtTime(0.15, now + i * 0.25);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.2);
          osc.connect(gain).connect(ringtoneCtx.destination);
          osc.start(now + i * 0.25);
          osc.stop(now + i * 0.25 + 0.2);
        }
      }
      playTone();
      ringtoneInterval = setInterval(playTone, 2000);
      console.log('[ringtone] Started');
    } catch (err) {
      console.warn('[ringtone] Could not start:', err.message);
    }
  }

  function stopIncomingRingtone() {
    if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
    if (ringtoneCtx) {
      try { ringtoneCtx.close(); } catch { /* ignore */ }
      ringtoneCtx = null;
    }
  }

  // ── Outgoing ringback tone (caller hears while waiting for answer) ──
  let ringbackCtx = null;
  let ringbackInterval = null;

  function startOutgoingRingback() {
    stopOutgoingRingback();
    try {
      ringbackCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Single sustained tone at 350 Hz for 2 s, silent for 4 s — classic ringback cadence
      function playRingbackTone() {
        if (!ringbackCtx || ringbackCtx.state === 'closed') return;
        const now = ringbackCtx.currentTime;
        const osc = ringbackCtx.createOscillator();
        const gain = ringbackCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 350;
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.12, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        osc.connect(gain).connect(ringbackCtx.destination);
        osc.start(now);
        osc.stop(now + 2.0);
      }
      playRingbackTone();
      ringbackInterval = setInterval(playRingbackTone, 4000);
      console.log('[ringback] Started');
    } catch (err) {
      console.warn('[ringback] Could not start:', err.message);
    }
  }

  function stopOutgoingRingback() {
    if (ringbackInterval) { clearInterval(ringbackInterval); ringbackInterval = null; }
    if (ringbackCtx) {
      try { ringbackCtx.close(); } catch { /* ignore */ }
      ringbackCtx = null;
    }
  }

  function startIncomingCallTimeout() {
    clearIncomingCallTimeout();
    incomingCallTimeoutId = setTimeout(() => {
      incomingCallTimeoutId = null;
      if (activeCall.status !== 'incoming-ringing') return;
      console.log('[call] Incoming call timeout — auto-rejecting');
      stopIncomingRingtone();
      rejectIncomingCall();
      handleCallEnded('missed');
      window.dispatchEvent(new CustomEvent('happyga:missed-call', {
        detail: { callerName: callScreenTitle?.textContent || 'Unknown', callerUid: '' },
      }));
    }, INCOMING_CALL_TIMEOUT_MS);
  }

  function clearIncomingCallTimeout() {
    if (incomingCallTimeoutId) { clearTimeout(incomingCallTimeoutId); incomingCallTimeoutId = null; }
  }

  // ── Call outcome resolution ──
  // Single source of truth for mapping a call result to user-facing labels.
  // Used by both the call modal and the sessions page.
  function resolveCallOutcome(finalStatus, durationSeconds) {
    if (finalStatus === 'completed' && durationSeconds > 0) return { label: 'Completed', note: '', connected: true };
    if (finalStatus === 'completed') return { label: 'Missed', note: 'No answer.', connected: false };
    const map = {
      canceled:    { label: 'Canceled',  note: 'Call canceled.',       connected: false },
      busy:        { label: 'Busy',      note: 'Listener is busy.',   connected: false },
      'no-answer': { label: 'Missed',    note: 'No answer.',          connected: false },
      failed:      { label: 'Failed',    note: 'Connection failed.',  connected: false },
    };
    return map[finalStatus] || { label: finalStatus || 'Unknown', note: '', connected: false };
  }

  /**
   * Central call-end handler.
   * Called from every disconnect/cancel/error/final path instead of
   * scattering setCallState('ended')/setCallState('failed') decisions.
   *
   * @param {'ended'|'canceled'|'missed'|'error'|'busy'|'no-answer'|'failed'} reason
   * @param {object} details — optional { durationSeconds, chargedCoins, endedDueToLowBalance, errorMessage }
   */
  function handleCallEnded(reason, details = {}) {
    logCallState(`handleCallEnded:${reason}`);
    stopCallTimer();

    const dur = details.durationSeconds ?? callTimerSeconds;

    if (reason === 'ended' && dur > 0) {
      // Successfully connected call that ended normally
      setCallState('ended', {
        durationSeconds: dur,
        chargedCoins: details.chargedCoins ?? Math.ceil(dur / 10),
        endedDueToLowBalance: details.endedDueToLowBalance,
      });
    } else {
      // Map reason to a user-visible label
      const statusMap = {
        canceled:    'canceled',
        missed:      'no-answer',
        'no-answer': 'no-answer',
        busy:        'busy',
        error:       'failed',
        failed:      'failed',
        ended:       'completed',   // ended with 0 duration
      };
      const outcome = resolveCallOutcome(statusMap[reason] || reason, dur);
      setCallState('failed', {
        statusLabel: outcome.label,
        note: details.errorMessage || outcome.note || 'Try again later.',
        showBuy: details.showBuy,
      });
    }

    // Always restore presence through the centralized path
    if (activeCall.voiceCall) {
      activeCall.voiceCall = null;
    }
    restorePresenceAfterCall();
  }

  function cleanupVoiceCall(reason) {
    console.log('[call] cleanupVoiceCall:', reason);
    stopOutgoingRingback();
    stopIncomingRingtone();
    clearIncomingCallTimeout();
    if (activeCall.voiceCall) {
      try { activeCall.voiceCall.disconnect(); } catch { /* ignore */ }
      activeCall.voiceCall = null;
    }
    clearIncomingCall();
    stopCallTimer();
    callTimerSeconds = 0;
    restorePresenceAfterCall();
  }

  /**
   * Restore listener presence to the correct state after a call ends.
   * This is the ONE place presence is restored — avoids scattering
   * presence updates across multiple branches.
   */
  function restorePresenceAfterCall() {
    if (!authState) return;
    const status = isDeviceReady() ? 'ready' : 'offline';
    syncListenerAppPresence(authState, status);
  }

  // ── In-call controls ──
  function setMuteButtonState(muted) {
    activeCall.muted = muted;
    if (muteBtn) {
      muteBtn.textContent = muted ? 'Unmute' : 'Mute';
      muteBtn.setAttribute('aria-pressed', String(muted));
    }
  }

  function toggleMute() {
    if (!activeCall.voiceCall) return;
    const next = !activeCall.muted;
    try {
      activeCall.voiceCall.mute(next);
      setMuteButtonState(next);
      console.log('[call] Mute toggled:', next);
    } catch (err) {
      console.warn('[call] Mute toggle failed:', err.message);
    }
  }

  function toggleSpeaker() {
    // Speaker output switching is not supported in current web/Capacitor setup.
    // This is a placeholder for future native implementation.
    console.log('[call] Speaker toggle not supported yet');
  }

  /**
   * Show/hide in-call controls based on current call state.
   * Controls are visible when connected or reconnecting.
   */
  function updateInCallControls(state) {
    const showControls = state === 'connected';
    if (inCallControls) inCallControls.classList.toggle('hidden', !showControls);
    // Reset mute state when controls are hidden
    if (!showControls) setMuteButtonState(false);
  }

  function openCallScreen(profile) {
    if (!callScreenModal || !callScreenTitle || !callScreenStatus || !callScreenNote || !callScreenBuyBtn) {
      return;
    }

    const displayName = String(profile.name || profile.username || '').replace(/^@+/, '');
    callScreenTitle.textContent = displayName;
    callScreenModal.classList.remove('hidden');
    setCallState('calling');
  }

  function closeCallScreen() {
    clearEndStateAutoClose();
    const sidToEnd = activeCall.tempCallId || activeCall.twilioCallSid;
    stopOutgoingRingback();
    stopIncomingRingtone();
    clearIncomingCallTimeout();
    cleanupVoiceCall('close');
    stopCallPolling();
    resetActiveCall();
    if (callScreenModal) {
      callScreenModal.classList.add('hidden');
    }
    // Re-enable action buttons for next call
    setCallActionState({ acceptDisabled: false, rejectDisabled: false, endDisabled: false });
    // End the backend call record if we have a sid
    if (sidToEnd) {
      console.log('[call] Ending call:', sidToEnd);
      endCall(sidToEnd).then(() => console.log('[call] Call ended OK')).catch((err) => console.error('[call] endCall failed:', err));
    }
    // Re-enable all call buttons (except offline ones)
    document.querySelectorAll('.call-btn[data-user]').forEach((btn) => {
      if (!btn.hasAttribute('aria-disabled')) {
        btn.disabled = false;
        btn.classList.remove('call-btn-loading');
        btn.removeAttribute('aria-busy');
      }
    });
  }

  function needsRecharge(message) {
    return /coins|required to start a call|at least/i.test(String(message || ''));
  }

  // ── Call-start helpers ──

  /**
   * Show "listener unavailable" message and close call flow.
   */
  function handleUnavailableListener(profile, button) {
    const reason = !profile.id
      ? 'no app-call identity'
      : !isDeviceReady()
        ? 'your voice device is not registered'
        : 'listener is not available';
    console.log('[call] listener unavailable —', reason);
    openCallScreen(profile);
    setCallState('failed', {
      statusLabel: 'Not available',
      note: 'This listener is not available right now. Try again later.',
    });
    button.classList.remove('call-btn-loading');
    button.removeAttribute('aria-busy');
  }

  /**
   * Primary path: app-to-app Voice SDK call.
   * Returns { ok: true } if call was initiated, { ok: false, reason } if it failed.
   */
  async function startAppVoiceCall(profile) {
    console.log('[call] using app-to-app path');

    // ── Pre-flight: verify balance + create activeCalls record ──
    let preflight;
    try {
      preflight = await appCallPreflight(authState, {
        listenerUid: profile.id,
        listenerName: profile.name || '',
        callerName: authState?.phone || 'User',
      });
    } catch (preflightErr) {
      console.error('[call] app-preflight failed:', preflightErr.message);
      return { ok: false, reason: preflightErr.message };
    }

    if (!preflight.allowed) {
      return { ok: false, reason: 'preflight rejected' };
    }

    if (preflight.wallet) updateWalletUi(preflight.wallet);

    // Populate activeCall state from preflight
    activeCall.transport = 'voice-client';
    activeCall.tempCallId = preflight.tempCallId;
    activeCall.listenerUid = profile.id;
    activeCall.listenerName = profile.name || null;
    logCallState('app-preflight-ok');

    // ── Connect via Twilio Device ──
    const targetIdentity = toTwilioIdentity(profile.id);
    console.log('[call] target identity:', targetIdentity);

    let voiceCall;
    try {
      voiceCall = await startVoiceCall(targetIdentity, {
        listenerId: profile.id,
        listenerName: profile.name || '',
        callerName: authState?.phone || 'User',
        callerUid: authState?.uid || '',
        listenerUid: profile.id,
      });
    } catch (connectErr) {
      console.error('[call] app-to-app connect failed:', connectErr.message);
      return { ok: false, reason: `connect error: ${connectErr.message}` };
    }

    if (!voiceCall) {
      return { ok: false, reason: 'startVoiceCall returned null' };
    }

    activeCall.voiceCall = voiceCall;
    logCallState('voice-call-started');
    setCallState('ringing', { note: 'Ringing...' });
    syncListenerAppPresence(authState, 'busy');

    wireVoiceCallLifecycle(voiceCall, {
      onAccept: () => {
        setCallState('connected');
        startCallTimer();
      },
      onDisconnect: () => {
        handleCallEnded('ended');
      },
      onCancel: () => {
        handleCallEnded('canceled');
      },
      onError: (err) => {
        cleanupVoiceCall('outgoing-error');
        handleCallEnded('error', { errorMessage: err.message || 'Connection error' });
      },
      onReconnecting: () => {
        if (callScreenStatus) callScreenStatus.textContent = 'Reconnecting...';
        if (callScreenTimer) callScreenTimer.classList.remove('hidden');
      },
      onReconnected: () => {
        if (callScreenStatus) callScreenStatus.textContent = 'Connected';
      },
    });

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Legacy PSTN fallback — NOT part of normal production flow ──
  // ── Only active when ENABLE_PSTN_FALLBACK is true              ──
  // ═══════════════════════════════════════════════════════════════
  async function attemptPstnFallback(reason, profile) {
    console.log('[call] PSTN fallback —', reason || 'using legacy path');
    activeCall.transport = 'pstn';

    const preflight = await startDemoCall(authState, profile.username);
    updateWalletUi(preflight.wallet);

    if (!preflight.callSid || !preflight.allowed) {
      setCallState('failed', { statusLabel: 'Call failed', note: preflight.note || 'Could not place the call.' });
      return;
    }

    activeCall.twilioCallSid = preflight.callSid;
    logCallState('pstn-fallback-started');
    setCallState('ringing', { note: preflight.note });
    startCallPolling(preflight.callSid);
  }
  // ── End PSTN fallback ────────────────────────────────────────

  const sessionsPage = createSessionsPage({ listElement: sessionsList });
  const bottomNav = createBottomNav({ buttons: navButtons, panels: viewPanels });

  const homePage = createHomePage({
    listElement: profilesList,
    authState,
    onStartCall: async (profile, button) => {
      // Prevent duplicate call attempts
      if (activeCall.status !== 'idle') return;

      // Block if there's already an active Voice SDK call
      if (activeCall.voiceCall && activeCall.voiceCall.status?.() !== 'closed') {
        console.warn('[call] Blocked — existing voice call still active');
        return;
      }

      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.classList.add('call-btn-loading');

      // ── Respect listener presence — don't call busy/offline listeners ──
      if (profile.isBusy) {
        console.log('[call] Blocked — listener is busy');
        openCallScreen(profile);
        setCallState('failed', { statusLabel: 'Busy', note: 'This listener is on another call. Try again shortly.' });
        button.classList.remove('call-btn-loading');
        button.removeAttribute('aria-busy');
        return;
      }

      // ── Decide transport ──
      const useAppCall = canUseVoiceAppCall(profile);
      console.log(`[call] transport decision: ${useAppCall ? 'voice-client' : 'pstn-fallback'}`,
        `(device=${isDeviceReady() ? 'registered' : 'not-ready'}, profile.id=${profile.id || 'missing'})`);

      if (!useAppCall) {
        // Voice SDK not available — fall back to PSTN calling via backend preflight
        console.log('[call] Voice device not ready — using PSTN path for listener:', profile.id);
        openCallScreen(profile);
        try {
          await attemptPstnFallback('voice-device-not-ready', profile);
        } catch (error) {
          if (needsRecharge(error.message)) {
            setCallState('failed', { statusLabel: 'Recharge required', note: 'Your coins are low. Recharge now to start this call.', showBuy: true });
          } else {
            setCallState('failed', { statusLabel: 'Call failed', note: error.message });
          }
        } finally {
          button.classList.remove('call-btn-loading');
          button.removeAttribute('aria-busy');
          if (activeCall.status === 'idle') button.disabled = false;
        }
        return;
      }

      // ── Primary path: app-to-app ──
      openCallScreen(profile);

      try {
        const result = await startAppVoiceCall(profile);

        if (!result.ok) {
          // App-to-app failed — fall back to PSTN
          console.log('[call] PSTN fallback after app-to-app failure:', result.reason);
          await attemptPstnFallback(result.reason, profile);
        }
      } catch (error) {
        if (needsRecharge(error.message)) {
          setCallState('failed', { statusLabel: 'Recharge required', note: 'Your coins are low. Recharge now to start this call.', showBuy: true });
        } else {
          setCallState('failed', { statusLabel: 'Call failed', note: error.message });
        }
      } finally {
        button.classList.remove('call-btn-loading');
        button.removeAttribute('aria-busy');
        if (activeCall.status === 'idle') button.disabled = false;
      }
    },
  });

  createProfilePage({
    profileForm,
    listenerForm,
    profileSummaryText,
    personalDetailsBtn,
    listenerProfileBtn,
    referFriendBtn,
    copyReferralBtn,
    withdrawBtn: document.getElementById('withdrawBtn'),
    logoutBtn,
    detailsModal,
    listenerModal,
    referModal,
    modalCloseButtons,
    authState,
    onLogout: async () => {
      const nativeFirebaseAuth = window.Capacitor?.isNativePlatform?.()
        ? window.Capacitor?.Plugins?.FirebaseAuthentication
        : null;
      clearAuthState();
      if (nativeFirebaseAuth) {
        try { await nativeFirebaseAuth.signOut(); } catch { /* ignore */ }
      }
      try { await signOut(firebaseAuth); } catch { /* ignore */ }
      window.location.href = 'login.html';
    },
  });

  createCoinsModal({
    triggerButton: coinsBtn,
    modal: coinsModal,
    closeButton: closeCoinsBtn,
    modalCard: coinsModalCard,
    planButtons,
    selectedPlanText,
    buyButton: buyNowBtn,
    onBuy: async (selectedPlan) => {
      try {
        const wallet = await rechargeWallet(authState, selectedPlan);
        updateWalletUi(wallet);
        setCallState('ringing', {
          note: `${wallet.addedCoins} coins added. New balance: ${wallet.balance} coins.`,
        });
      } catch (error) {
        callStatusText.textContent = error.message;
        alert(error.message);
      }
    },
  });

  if (callScreenCloseBtn) {
    callScreenCloseBtn.addEventListener('click', () => {
      if (callScreenCloseBtn.disabled) return;
      setCallActionState({ endDisabled: true });
      closeCallScreen();
    });
  }

  if (callScreenBuyBtn) {
    callScreenBuyBtn.addEventListener('click', () => {
      closeCallScreen();
      if (coinsBtn) {
        coinsBtn.click();
      }
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', toggleMute);
  }

  if (speakerBtn) {
    speakerBtn.addEventListener('click', toggleSpeaker);
  }

  if (callScreenModal) {
    callScreenModal.addEventListener('click', (event) => {
      if (event.target === callScreenModal) {
        closeCallScreen();
      }
    });
  }

  // ── Incoming call handling ──
  if (incomingAcceptBtn) {
    incomingAcceptBtn.addEventListener('click', () => {
      if (incomingAcceptBtn.disabled) return;
      setCallActionState({ acceptDisabled: true, rejectDisabled: true });
      stopIncomingRingtone();
      clearIncomingCallTimeout();
      const call = acceptIncomingCall();
      if (!call) return;

      activeCall.voiceCall = call;
      activeCall.transport = 'voice-client';
      setCallState('connected');
      startCallTimer();
      syncListenerAppPresence(authState, 'busy');

      wireVoiceCallLifecycle(call, {
        onDisconnect: () => {
          handleCallEnded('ended');
        },
        onError: (err) => {
          cleanupVoiceCall('incoming-error');
          handleCallEnded('error', { errorMessage: err.message || 'Connection error' });
        },
        onReconnecting: () => {
          if (callScreenStatus) callScreenStatus.textContent = 'Reconnecting...';
          if (callScreenTimer) callScreenTimer.classList.remove('hidden');
        },
        onReconnected: () => {
          if (callScreenStatus) callScreenStatus.textContent = 'Connected';
        },
      });
    });
  }

  if (incomingRejectBtn) {
    incomingRejectBtn.addEventListener('click', () => {
      if (incomingRejectBtn.disabled) return;
      setCallActionState({ acceptDisabled: true, rejectDisabled: true });
      stopIncomingRingtone();
      clearIncomingCallTimeout();
      rejectIncomingCall();
      activeCall.voiceCall = null;
      closeCallScreen();
    });
  }

  window.addEventListener('happyga:incoming-call', (event) => {
    const { from, callerName, callerUid, call } = event.detail;
    console.log('[call] Incoming call — from:', from, 'callerName:', callerName);

    // Don't interrupt an active call
    if (activeCall.status !== 'idle') {
      console.log('[call] Already in a call, auto-rejecting incoming');
      rejectIncomingCall();
      return;
    }

    // Open call screen in incoming mode
    if (callScreenModal && callScreenTitle) {
      const displayName = callerName || from?.replace(/^client:/, '') || 'Unknown';
      callScreenTitle.textContent = displayName;
      callScreenModal.classList.remove('hidden');
      setCallState('incoming-ringing', { note: 'Tap Accept to answer.' });
    }

    // Start ringtone and auto-reject timeout
    startIncomingRingtone();
    startIncomingCallTimeout();

    // If the caller cancels before we accept/reject, mark as missed
    wireVoiceCallLifecycle(call, {
      onCancel: () => {
        console.log('[call] Incoming call cancelled by caller');
        stopIncomingRingtone();
        clearIncomingCallTimeout();
        if (activeCall.status === 'incoming-ringing') {
          handleCallEnded('missed');
          // Emit missed-call event for other parts of the app
          window.dispatchEvent(new CustomEvent('happyga:missed-call', {
            detail: { callerName: callerName || from?.replace(/^client:/, '') || 'Unknown', callerUid: callerUid || '' },
          }));
        }
      },
    });
  });

  initRandomCallButton({
    button: randomCallBtn,
    getCallButtons: () => homePage.getCallButtons(),
    showHomeView: () => bottomNav.switchView('home'),
  });

  // Topbar logout button
  if (document.getElementById('topLogoutBtn')) {
    document.getElementById('topLogoutBtn').addEventListener('click', async () => {
      const nativeFirebaseAuth = window.Capacitor?.isNativePlatform?.()
        ? window.Capacitor?.Plugins?.FirebaseAuthentication
        : null;
      clearAuthState();
      if (nativeFirebaseAuth) {
        try { await nativeFirebaseAuth.signOut(); } catch { /* ignore */ }
      }
      try { await signOut(firebaseAuth); } catch { /* ignore */ }
      window.location.href = 'login.html';
    });
  }

  try {
    console.log('[DEBUG-MAIN] Fetching wallet & sessions. authState:', JSON.stringify({
      phone: authState?.phone,
      uid: authState?.uid,
      mode: authState?.mode,
      hasToken: !!authState?.idToken,
      tokenPrefix: authState?.idToken?.substring(0, 20),
    }));
    const [wallet, sessions] = await Promise.all([
      fetchWallet(authState),
      fetchSessions(authState),
    ]);
    console.log('[DEBUG-MAIN] fetchWallet SUCCESS:', JSON.stringify(wallet));
    updateWalletUi(wallet);
    sessionsPage.setSessions(sessions);
  } catch (error) {
    console.error('[DEBUG-MAIN] fetchWallet/fetchSessions FAILED:', error?.message || error);
    console.error('[DEBUG-MAIN] Full error:', error);
    updateWalletUi({ balance: 0 });
    sessionsPage.setSessions([]);
  }

  // ── Listener app-call presence sync on device state changes ──
  // Check listener mode via the dashboard toggle button text.
  function isListenerModeOn() {
    const btn = document.getElementById('switchListenerModeBtn');
    return btn?.textContent?.trim() === 'Go Offline';
  }

  window.addEventListener('happyga:voice-device-online', () => {
    console.log('[presence] Device registered → syncing presence');
    if (isListenerModeOn()) {
      syncListenerAppPresence(authState, 'ready');
    }
  });
  window.addEventListener('happyga:voice-device-offline', () => {
    console.log('[presence] Device unregistered → syncing unregistered');
    syncListenerAppPresence(authState, 'unregistered');
  });

  // ── App lifecycle: resume / visibility / network recovery ──
  async function onAppResume(source) {
    if (!authState) return;

    const deviceState = getDeviceState();
    const inCall = activeCall.status !== 'idle' && activeCall.status !== 'ended' && activeCall.status !== 'failed';
    console.log(`[lifecycle] onAppResume (${source}) — device: ${deviceState}, inCall: ${inCall}`);

    // Don't interfere while a call is ongoing
    if (inCall) return;

    if (deviceState === 'missing' || deviceState === 'destroyed') {
      console.log('[lifecycle] Device missing/destroyed — full re-init');
      await initVoiceDevice();
      // 'registered' event → voice-device-online → presence synced automatically
    } else if (deviceState !== 'registered') {
      console.log('[lifecycle] Device not registered — attempting re-register');
      const ok = await ensureDeviceRegistered();
      if (!ok) {
        console.log('[lifecycle] Re-register failed — full re-init');
        await initVoiceDevice();
      }
      // 'registered' event → voice-device-online → presence synced automatically
    } else {
      // Device already registered — just resync presence
      console.log('[lifecycle] Device already registered — resync presence');
      if (isListenerModeOn()) {
        syncListenerAppPresence(authState, 'ready');
      }
    }
  }

  // Page visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      onAppResume('visibility');
    }
  });

  // Network restored
  window.addEventListener('online', () => {
    onAppResume('network-online');
  });

  // Capacitor native app state change
  if (window.Capacitor?.isNativePlatform?.()) {
    try {
      const appPlugin = window.Capacitor.Plugins?.App;
      if (appPlugin?.addListener) {
        appPlugin.addListener('appStateChange', ({ isActive }) => {
          if (isActive) onAppResume('capacitor-resume');
        });
        console.log('[lifecycle] Capacitor appStateChange listener attached');
      }
    } catch (e) {
      console.warn('[lifecycle] Capacitor App plugin not available:', e.message);
    }
  }

  // ── Periodic health check (every 45 s) ──
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!authState) return;
    if (activeCall.status !== 'idle') return;

    const deviceState = getDeviceState();
    if (deviceState === 'registered') return; // healthy

    console.log('[health] Device not registered (state:', deviceState + ') — recovering');

    if (deviceState === 'missing' || deviceState === 'destroyed') {
      initVoiceDevice().catch(() => {});
    } else {
      ensureDeviceRegistered().then(ok => {
        if (!ok) initVoiceDevice().catch(() => {});
      });
    }
  }, 45000);

  // Register Twilio Voice device (non-blocking)
  initVoiceDevice().catch(() => {});
}

init().catch((error) => {
  const callStatusText = document.getElementById('callStatusText');
  if (callStatusText) {
    callStatusText.textContent = error.message;
  }

  console.error(error);
});