import { createBottomNav } from './components/bottom-nav.js';
import { createCoinsModal } from './components/coins-modal.js';
import { initRandomCallButton } from './components/random-call-button.js';
import { createHomePage } from './pages/home-page.js';
import { createProfilePage } from './pages/profile-page.js';
import { createSessionsPage } from './pages/sessions-page.js';
import { loadFragments } from './shared/fragment-loader.js';
import { clearAuthState, readAuthState } from './services/auth.js';
import { firebaseAuth } from './firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  fetchSessions,
  fetchWallet,
  rechargeWallet,
  startDemoCall,
  apiFetch,
  getCallStatus,
} from './services/api.js';

async function init() {
  await loadFragments();

  const authState = readAuthState();
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
  const callScreenPhoneRow = document.getElementById('callScreenPhoneRow');
  const callScreenPhoneInput = document.getElementById('callScreenPhoneInput');
  const callScreenDialBtn = document.getElementById('callScreenDialBtn');
  const callScreenDialStatus = document.getElementById('callScreenDialStatus');
  const callScreenTimer = document.getElementById('callScreenTimer');
  const callScreenSummary = document.getElementById('callScreenSummary');

  // --- Call state machine ---
  let callState = 'idle'; // idle | calling | ringing | connected | ended | failed
  let callTimerInterval = null;
  let callTimerSeconds = 0;
  let callPollInterval = null;
  let activeCallSid = null;

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

  function setCallState(newState, extra = {}) {
    callState = newState;
    if (!callScreenStatus || !callScreenNote) return;

    // Reset classes
    callScreenStatus.className = 'call-screen-status';
    if (callScreenTimer) callScreenTimer.classList.add('hidden');
    if (callScreenSummary) callScreenSummary.classList.add('hidden');
    callScreenBuyBtn?.classList.add('hidden');

    switch (newState) {
      case 'calling':
        callScreenStatus.textContent = 'Calling...';
        callScreenStatus.classList.add('is-calling');
        callScreenNote.textContent = 'Trying to connect now.';
        break;
      case 'ringing':
        callScreenStatus.textContent = 'Ringing...';
        callScreenStatus.classList.add('is-calling');
        callScreenNote.textContent = extra.note || 'Waiting for answer.';
        break;
      case 'connected':
        callScreenStatus.textContent = 'Connected';
        callScreenStatus.classList.add('is-connected');
        callScreenNote.textContent = '1 coin per 10 seconds';
        if (callScreenTimer) callScreenTimer.classList.remove('hidden');
        break;
      case 'ended':
        stopCallTimer();
        stopCallPolling();
        callScreenStatus.textContent = 'Call ended';
        callScreenStatus.classList.add('is-ended');
        callScreenNote.textContent = '';
        if (callScreenTimer) {
          callScreenTimer.textContent = formatTimer(extra.durationSeconds || callTimerSeconds);
          callScreenTimer.classList.remove('hidden');
        }
        if (callScreenSummary) {
          const dur = extra.durationSeconds || callTimerSeconds;
          const coins = extra.chargedCoins ?? Math.ceil(dur / 10);
          const parts = [`Duration: ${formatTimer(dur)}`, `Charged: ${coins} coin${coins !== 1 ? 's' : ''}`];
          if (extra.endedDueToLowBalance) parts.push('(ended — low balance)');
          callScreenSummary.textContent = parts.join('  •  ');
          callScreenSummary.classList.remove('hidden');
        }
        break;
      case 'failed':
        stopCallTimer();
        stopCallPolling();
        callScreenStatus.textContent = extra.statusLabel || 'Call failed';
        callScreenStatus.classList.add('is-busy');
        callScreenNote.textContent = extra.note || 'Try again later.';
        if (extra.showBuy) callScreenBuyBtn?.classList.remove('hidden');
        break;
    }
  }

  function startCallPolling(callSid) {
    activeCallSid = callSid;
    let wasConnected = false;

    callPollInterval = setInterval(async () => {
      try {
        const s = await getCallStatus(callSid);

        // in-progress = answered
        if (s.status === 'in-progress' && callState !== 'connected') {
          wasConnected = true;
          setCallState('connected');
          startCallTimer();
        }

        // finalized
        if (s.finalized) {
          if (s.answered && s.durationSeconds > 0) {
            setCallState('ended', {
              durationSeconds: s.durationSeconds,
              chargedCoins: s.chargedCoins,
              endedDueToLowBalance: s.endedDueToLowBalance,
            });
          } else {
            const labels = { busy: 'User is busy', 'no-answer': 'No answer', failed: 'Call failed', canceled: 'Call canceled' };
            setCallState('failed', {
              statusLabel: labels[s.finalStatus] || 'Call ended',
              note: s.finalStatus === 'busy' ? 'Try another profile or call again in a moment.' : 'The call could not be completed.',
            });
          }
          return;
        }

        // terminal Twilio statuses before finalized (edge case)
        const terminalStatuses = new Set(['busy', 'no-answer', 'failed', 'canceled']);
        if (terminalStatuses.has(s.status) && callState !== 'failed' && callState !== 'ended') {
          const labels = { busy: 'User is busy', 'no-answer': 'No answer', failed: 'Call failed', canceled: 'Call canceled' };
          setCallState('failed', {
            statusLabel: labels[s.status] || 'Call ended',
            note: s.status === 'busy' ? 'Try another profile or call again in a moment.' : 'The call could not be completed.',
          });
        }

        if (s.status === 'completed' && callState !== 'ended' && callState !== 'failed') {
          if (wasConnected || s.answered) {
            setCallState('ended', {
              durationSeconds: s.durationSeconds || callTimerSeconds,
              chargedCoins: s.chargedCoins || Math.ceil((s.durationSeconds || callTimerSeconds) / 10),
              endedDueToLowBalance: s.endedDueToLowBalance,
            });
          } else {
            setCallState('failed', { statusLabel: 'No answer', note: 'The call could not be completed.' });
          }
        }
      } catch {
        // polling error — ignore, retry next tick
      }
    }, 2000);
  }

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

  function openCallScreen(profile) {
    if (!callScreenModal || !callScreenTitle || !callScreenStatus || !callScreenNote || !callScreenBuyBtn) {
      return;
    }

    callScreenTitle.textContent = `Calling @${profile.username}`;
    if (callScreenPhoneRow) callScreenPhoneRow.classList.remove('hidden');
    if (callScreenDialStatus) { callScreenDialStatus.textContent = ''; callScreenDialStatus.className = 'call-screen-dial-status'; }
    callScreenModal.classList.remove('hidden');
    setCallState('calling');
  }

  function closeCallScreen() {
    stopCallTimer();
    stopCallPolling();
    callState = 'idle';
    activeCallSid = null;
    if (callScreenModal) {
      callScreenModal.classList.add('hidden');
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

  const sessionsPage = createSessionsPage({ listElement: sessionsList });
  const bottomNav = createBottomNav({ buttons: navButtons, panels: viewPanels });

  const homePage = createHomePage({
    listElement: profilesList,
    authState,
    onStartCall: async (profile, button) => {
      // Prevent duplicate call attempts
      if (callState !== 'idle') return;

      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.classList.add('call-btn-loading');
      openCallScreen(profile);

      try {
        const preflight = await startDemoCall(authState, profile.username);
        updateWalletUi(preflight.wallet);

        if (!preflight.callSid || !preflight.allowed) {
          setCallState('failed', { statusLabel: 'Call failed', note: preflight.note || 'Could not place the call.' });
          return;
        }

        // Preflight succeeded — move to ringing
        setCallState('ringing', { note: preflight.note });

        // Start polling call status
        startCallPolling(preflight.callSid);
      } catch (error) {
        if (needsRecharge(error.message)) {
          setCallState('failed', {
            statusLabel: 'Recharge required',
            note: 'Your coins are low. Recharge now to start this call.',
            showBuy: true,
          });
        } else {
          setCallState('failed', { statusLabel: 'Call failed', note: error.message });
        }
      } finally {
        button.classList.remove('call-btn-loading');
        button.removeAttribute('aria-busy');
        // Re-enable only if call flow finished (idle means modal was closed)
        if (callState === 'idle') button.disabled = false;
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

  if (callScreenDialBtn && callScreenPhoneInput && callScreenDialStatus) {
    callScreenDialBtn.addEventListener('click', async () => {
      const toNumber = callScreenPhoneInput.value.trim();
      if (!toNumber || toNumber.replace(/\D/g, '').length < 10) {
        callScreenDialStatus.textContent = 'Enter a valid phone number.';
        callScreenDialStatus.className = 'call-screen-dial-status dial-err';
        return;
      }
      callScreenDialBtn.disabled = true;
      callScreenDialStatus.textContent = 'Dialling...';
      callScreenDialStatus.className = 'call-screen-dial-status';
      try {
        const res = await apiFetch('/api/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'toNumber=' + encodeURIComponent(toNumber),
        });
        const data = await res.json();
        if (data.success) {
          callScreenDialStatus.textContent = `\u2705 Ringing ${toNumber} — pick up!`;
        } else {
          callScreenDialStatus.textContent = `\u274c ${data.error || 'Call failed'}`;
          callScreenDialStatus.classList.add('dial-err');
        }
      } catch (err) {
        callScreenDialStatus.textContent = `\u274c ${err.message}`;
        callScreenDialStatus.classList.add('dial-err');
      } finally {
        callScreenDialBtn.disabled = false;
      }
    });
  }

  if (callScreenCloseBtn) {
    callScreenCloseBtn.addEventListener('click', closeCallScreen);
  }

  if (callScreenBuyBtn) {
    callScreenBuyBtn.addEventListener('click', () => {
      closeCallScreen();
      if (coinsBtn) {
        coinsBtn.click();
      }
    });
  }

  if (callScreenModal) {
    callScreenModal.addEventListener('click', (event) => {
      if (event.target === callScreenModal) {
        closeCallScreen();
      }
    });
  }

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
    const [wallet, sessions] = await Promise.all([
      fetchWallet(authState),
      fetchSessions(authState),
    ]);
    updateWalletUi(wallet);
    sessionsPage.setSessions(sessions);
  } catch (error) {
    updateWalletUi({ balance: 0 });
    sessionsPage.setSessions([]);
  }
}

init().catch((error) => {
  const callStatusText = document.getElementById('callStatusText');
  if (callStatusText) {
    callStatusText.textContent = error.message;
  }

  console.error(error);
});