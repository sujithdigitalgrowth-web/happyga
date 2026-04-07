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
  saveSession,
  startDemoCall,
  apiFetch,
} from './services/api.js';

const DEFAULT_CALL_COST_COINS = 6;
const BUSY_SIMULATION_RATE = 0.35;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSessionEntry(profile, duration) {
  return {
    name: profile.name,
    username: profile.username,
    duration,
    when: `Today • ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
  };
}

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

  let walletState = {
    balance: 0,
    callCostCoins: DEFAULT_CALL_COST_COINS,
    storage: 'memory',
  };

  function updateWalletUi(wallet) {
    walletState = {
      ...walletState,
      ...wallet,
    };

    walletBalanceText.textContent = `${walletState.balance} coins available`;
    callStatusText.textContent = `Demo calls reserve ${walletState.callCostCoins} coins before connecting.`;

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
    callScreenStatus.textContent = 'Calling...';
    callScreenStatus.classList.add('is-calling');
    callScreenStatus.classList.remove('is-busy', 'is-recharge');
    callScreenNote.textContent = 'Trying to connect now.';
    callScreenBuyBtn.classList.add('hidden');
    if (callScreenPhoneRow) callScreenPhoneRow.classList.remove('hidden');
    if (callScreenDialStatus) { callScreenDialStatus.textContent = ''; callScreenDialStatus.className = 'call-screen-dial-status'; }
    callScreenModal.classList.remove('hidden');
  }

  function setCallScreenState({ status, note, state = 'calling', showBuy = false }) {
    if (!callScreenStatus || !callScreenNote || !callScreenBuyBtn) {
      return;
    }

    callScreenStatus.textContent = status;
    callScreenStatus.classList.toggle('is-calling', state === 'calling');
    callScreenStatus.classList.toggle('is-busy', state === 'busy');
    callScreenStatus.classList.toggle('is-recharge', state === 'recharge');
    callScreenNote.textContent = note;
    callScreenBuyBtn.classList.toggle('hidden', !showBuy);
  }

  function closeCallScreen() {
    if (callScreenModal) {
      callScreenModal.classList.add('hidden');
    }
  }

  function needsRecharge(message) {
    return /coins|required to start a call|at least/i.test(String(message || ''));
  }

  const sessionsPage = createSessionsPage({ listElement: sessionsList });
  const bottomNav = createBottomNav({ buttons: navButtons, panels: viewPanels });

  const homePage = createHomePage({
    listElement: profilesList,
    onStartCall: async (profile, button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      openCallScreen(profile);

      try {
        await sleep(900);

        if (Math.random() < BUSY_SIMULATION_RATE) {
          const busyMessage = `@${profile.username} is busy right now.`;
          callStatusText.textContent = busyMessage;
          setCallScreenState({
            status: 'User is busy',
            note: 'Try another profile or call again in a moment.',
            state: 'busy',
          });
          return;
        }

        const preflight = await startDemoCall(authState, profile.username);
        updateWalletUi(preflight.wallet);
        callStatusText.textContent = preflight.note;
        setCallScreenState({
          status: 'Calling...',
          note: preflight.note,
          state: 'calling',
        });

        const session = buildSessionEntry(profile, preflight.estimatedDuration);
        sessionsPage.addSession(session);

        try {
          await saveSession(authState, session);
        } catch (error) {
          callStatusText.textContent = `${preflight.note} Session save failed: ${error.message}`;
        }
      } catch (error) {
        callStatusText.textContent = error.message;

        if (needsRecharge(error.message)) {
          setCallScreenState({
            status: 'Recharge required',
            note: 'Your coins are low. Recharge now to start this call.',
            state: 'recharge',
            showBuy: true,
          });
        } else {
          setCallScreenState({
            status: 'Call failed',
            note: error.message,
            state: 'busy',
          });
        }
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
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
    logoutBtn,
    detailsModal,
    listenerModal,
    referModal,
    modalCloseButtons,
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
        setCallScreenState({
          status: 'Recharge successful',
          note: `${wallet.addedCoins} coins added. New balance: ${wallet.balance} coins.`,
          state: 'calling',
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