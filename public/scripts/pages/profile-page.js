import { createWithdrawal, createListenerProfile, getListenerProfile, getWithdrawals, updateListenerStatus, getListenerSessions, getTransactions } from '../services/api.js';

export function createProfilePage({
  profileForm,
  listenerForm,
  profileSummaryText,
  personalDetailsBtn,
  listenerProfileBtn,
  referFriendBtn,
  copyReferralBtn,
  withdrawBtn,
  logoutBtn,
  detailsModal,
  listenerModal,
  referModal,
  modalCloseButtons,
  authState,
  onLogout,
}) {
  const profileState = {
    name: 'Rahul',
    age: '26',
    interests: ['Casual Chat', 'Deep Conversations', 'Timepass / Chill'],
  };

  let listenerState = null;

  function openModal(modal) {
    modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
  }

  function parseCoins(value) {
    const n = Number(String(value || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function formatDate(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return new Date(value).toLocaleString();
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? '-' : new Date(parsed).toLocaleString();
    }
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toLocaleString();
    }
    return '-';
  }

  const MAX_INTERESTS = 3;

  function syncChips() {
    const chips = document.querySelectorAll('#interestChips .interest-chip');
    chips.forEach((chip) => {
      const selected = profileState.interests.includes(chip.dataset.value);
      chip.classList.toggle('selected', selected);
      chip.disabled = !selected && profileState.interests.length >= MAX_INTERESTS;
    });
  }

  function initChips() {
    const container = document.getElementById('interestChips');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.interest-chip');
      if (!chip) return;
      const val = chip.dataset.value;
      const idx = profileState.interests.indexOf(val);
      if (idx > -1) {
        profileState.interests.splice(idx, 1);
      } else if (profileState.interests.length < MAX_INTERESTS) {
        profileState.interests.push(val);
      }
      syncChips();
    });
  }

  function syncProfileForm() {
    profileForm.elements.name.value = profileState.name;
    profileForm.elements.age.value = profileState.age;
    syncChips();
    profileSummaryText.textContent = `${profileState.name}, ${profileState.age} • ${profileState.interests.join(' • ')}`;
  }

  initChips();

  // --- Listener interest chips ---
  let listenerInterests = [];
  const MAX_LISTENER_INTERESTS = 3;

  function syncListenerChips() {
    const chips = document.querySelectorAll('#listenerInterestChips .interest-chip');
    chips.forEach((chip) => {
      const selected = listenerInterests.includes(chip.dataset.value);
      chip.classList.toggle('selected', selected);
      chip.disabled = !selected && listenerInterests.length >= MAX_LISTENER_INTERESTS;
    });
  }

  function initListenerChips() {
    const container = document.getElementById('listenerInterestChips');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.interest-chip');
      if (!chip) return;
      const val = chip.dataset.value;
      const idx = listenerInterests.indexOf(val);
      if (idx > -1) {
        listenerInterests.splice(idx, 1);
      } else if (listenerInterests.length < MAX_LISTENER_INTERESTS) {
        listenerInterests.push(val);
      }
      syncListenerChips();
    });
  }

  initListenerChips();

  personalDetailsBtn.addEventListener('click', () => openModal(detailsModal));
  listenerProfileBtn.addEventListener('click', () => openModal(listenerModal));

  // --- Transactions ---
  const transactionsBtn = document.getElementById('transactionsBtn');
  const transactionsOverlay = document.getElementById('transactionsOverlay');
  const transactionsList = document.getElementById('transactionsList');
  const closeTransactionsBtn = document.getElementById('closeTransactionsBtn');

  if (transactionsBtn) {
    transactionsBtn.addEventListener('click', async () => {
      if (transactionsOverlay) transactionsOverlay.classList.remove('hidden');
      transactionsList.innerHTML = '<p class="transactions-empty">Loading...</p>';

      try {
        const data = await getTransactions(authState);
        const txns = data?.transactions || [];
        if (!txns.length) {
          transactionsList.innerHTML = '<p class="transactions-empty">No transactions yet</p>';
          return;
        }
        transactionsList.innerHTML = txns.map((t) => {
          const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
          const priceText = t.price ? `₹${t.price}` : '';
          return `
            <div class="txn-row">
              <div class="txn-left">
                <span class="txn-icon">🪙</span>
                <div>
                  <p class="txn-title">+${t.coins} Coins</p>
                  <p class="txn-date">${date}</p>
                </div>
              </div>
              <div class="txn-right">
                ${priceText ? `<span class="txn-price">${priceText}</span>` : ''}
                <span class="txn-balance">Bal: ${t.balanceAfter}</span>
              </div>
            </div>`;
        }).join('');
      } catch (err) {
        transactionsList.innerHTML = '<p class="transactions-empty">Failed to load transactions</p>';
      }
    });
  }

  if (closeTransactionsBtn) {
    closeTransactionsBtn.addEventListener('click', () => {
      if (transactionsOverlay) transactionsOverlay.classList.add('hidden');
    });
  }
  if (referFriendBtn) {
    referFriendBtn.addEventListener('click', () => openModal(referModal));
  }

  let listenerStatus = 'not_registered'; // 'not_registered' | 'pending' | 'approved'
  const listenerDashboard = document.getElementById('listenerDashboard');
  const openListenerDashboardBtn = document.getElementById('openListenerDashboardBtn');
  const listenerDashboardOverlay = document.getElementById('listenerDashboardOverlay');
  const closeListenerDashboardBtn = document.getElementById('closeListenerDashboardBtn');

  if (openListenerDashboardBtn) {
    openListenerDashboardBtn.addEventListener('click', () => {
      if (listenerDashboardOverlay) listenerDashboardOverlay.classList.remove('hidden');
    });
  }
  if (closeListenerDashboardBtn) {
    closeListenerDashboardBtn.addEventListener('click', () => {
      if (listenerDashboardOverlay) listenerDashboardOverlay.classList.add('hidden');
    });
  }

  // ── Account Settings overlay ──
  const accountSettingsBtn = document.getElementById('accountSettingsBtn');
  const accountSettingsOverlay = document.getElementById('accountSettingsOverlay');
  const closeAccountSettingsBtn = document.getElementById('closeAccountSettingsBtn');

  if (accountSettingsBtn) {
    accountSettingsBtn.addEventListener('click', () => {
      if (accountSettingsOverlay) accountSettingsOverlay.classList.remove('hidden');
    });
  }
  if (closeAccountSettingsBtn) {
    closeAccountSettingsBtn.addEventListener('click', () => {
      if (accountSettingsOverlay) accountSettingsOverlay.classList.add('hidden');
    });
  }

  // Privacy Policy
  const privacyPolicyBtn = document.getElementById('privacyPolicyBtn');
  if (privacyPolicyBtn) {
    privacyPolicyBtn.addEventListener('click', () => {
      window.open('https://happyga.in/privacy-policy', '_blank');
    });
  }

  // Community Guidelines
  const communityGuidelinesBtn = document.getElementById('communityGuidelinesBtn');
  if (communityGuidelinesBtn) {
    communityGuidelinesBtn.addEventListener('click', () => {
      window.open('https://happyga.in/community-guidelines', '_blank');
    });
  }

  // Delete Account
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure you want to delete your account? This action is permanent and cannot be undone.');
      if (!confirmed) return;
      try {
        const res = await fetch('/api/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authState.token}` },
        });
        if (!res.ok) throw new Error('Delete failed');
        alert('Your account has been deleted.');
        if (typeof onLogout === 'function') onLogout();
      } catch (err) {
        console.error('Account deletion error:', err);
        alert('Failed to delete account. Please try again.');
      }
    });
  }

  // Exit Listener Mode — go offline and close dashboard
  const listenerLogoutBtn = document.getElementById('listenerLogoutBtn');
  if (listenerLogoutBtn) {
    listenerLogoutBtn.addEventListener('click', async () => {
      try {
        await updateListenerStatus(authState, false);
        syncStatusBadge(false);
        const statusText = document.getElementById('listenerStatusText');
        if (statusText) statusText.innerText = 'Offline';
        const goOnlineBtn = document.getElementById('goOnlineBtn');
        const goOfflineBtn = document.getElementById('goOfflineBtn');
        if (goOnlineBtn) goOnlineBtn.style.display = 'inline-block';
        if (goOfflineBtn) goOfflineBtn.style.display = 'none';
      } catch (err) {
        console.error('Failed to go offline:', err);
      }
      if (listenerDashboardOverlay) listenerDashboardOverlay.classList.add('hidden');
    });
  }

  function handleSwitchToListenerMode() {
    // Hide normal profile options
    const accountOptions = document.querySelector('.account-options');
    if (accountOptions) accountOptions.style.display = 'none';

    // Show listener mode section
    const listenerModeSection = document.getElementById('listenerModeSection');
    if (listenerModeSection) {
      listenerModeSection.style.display = 'block';
    }
  }

  function handleBackToProfile() {
    const accountOptions = document.querySelector('.account-options');
    if (accountOptions) accountOptions.style.display = '';

    const listenerModeSection = document.getElementById('listenerModeSection');
    if (listenerModeSection) {
      listenerModeSection.style.display = 'none';
    }
  }

  document
    .getElementById('switchListenerModeBtn')
    .addEventListener('click', async () => {
      const btn = document.getElementById('switchListenerModeBtn');
      const isCurrentlyOnline = btn.textContent.trim() === 'Go Offline';
      btn.disabled = true;
      try {
        if (isCurrentlyOnline) {
          await updateListenerStatus(authState, false);
          btn.textContent = 'Go Online';
          syncStatusBadge(false);
        } else {
          await updateListenerStatus(authState, true);
          btn.textContent = 'Go Offline';
          syncStatusBadge(true);
        }
      } catch (err) {
        console.error('Failed to toggle listener status:', err);
      }
      btn.disabled = false;
    });

  const backToProfileBtn = document.getElementById('backToProfileBtn');
  if (backToProfileBtn) {
    backToProfileBtn.addEventListener('click', handleBackToProfile);
  }

  function syncStatusBadge(isOnline) {
    const badge = document.getElementById('listenerStatusBadge');
    const badgeText = document.getElementById('listenerBadgeText');
    if (!badge || !badgeText) return;
    badge.className = 'listener-status-badge ' + (isOnline ? 'online' : 'offline');
    badgeText.textContent = isOnline ? 'Online' : 'Offline';
  }

  function formatDuration(seconds) {
    const s = Number(seconds) || 0;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  async function loadListenerRecentCalls() {
    const list = document.getElementById('listenerRecentCallsList');
    if (!list) return;

    try {
      const res = await getListenerSessions(authState);
      if (!res.sessions || res.sessions.length === 0) {
        list.innerHTML = '<p class="recent-calls-empty">No calls yet</p>';
        return;
      }

      list.innerHTML = res.sessions.map((s) => {
        const when = formatDate(s.completedAt);
        const dur = formatDuration(s.durationSeconds);
        const coins = s.earnedCoins || 0;
        return `<div class="recent-call-item">
          <div class="recent-call-top">
            <span class="recent-call-duration">${dur}</span>
            <span class="recent-call-coins">+${coins} coins</span>
          </div>
          <span class="recent-call-time">${when}</span>
        </div>`;
      }).join('');
    } catch (err) {
      console.error('Failed to load listener recent calls:', err);
      list.innerHTML = '<p class="recent-calls-empty">Failed to load</p>';
    }
  }

  async function handleGoOnline() {
    try {
      await updateListenerStatus(authState, true);

      const statusText = document.getElementById("listenerStatusText");
      const goOnlineBtn = document.getElementById("goOnlineBtn");
      const goOfflineBtn = document.getElementById("goOfflineBtn");

      if (statusText) statusText.innerText = "Online";
      if (goOnlineBtn) goOnlineBtn.style.display = "none";
      if (goOfflineBtn) goOfflineBtn.style.display = "inline-block";
      syncStatusBadge(true);
    } catch (err) {
      console.error("Failed to go online", err);
    }
  }

  async function handleGoOffline() {
    try {
      await updateListenerStatus(authState, false);

      const statusText = document.getElementById("listenerStatusText");
      const goOnlineBtn = document.getElementById("goOnlineBtn");
      const goOfflineBtn = document.getElementById("goOfflineBtn");

      if (statusText) statusText.innerText = "Offline";
      if (goOnlineBtn) goOnlineBtn.style.display = "inline-block";
      if (goOfflineBtn) goOfflineBtn.style.display = "none";
      syncStatusBadge(false);
    } catch (err) {
      console.error("Failed to go offline", err);
    }
  }

  document.getElementById("goOnlineBtn").addEventListener("click", handleGoOnline);
  document.getElementById("goOfflineBtn").addEventListener("click", handleGoOffline);

  async function loadWithdrawalHistory() {
    try {
      const res = await getWithdrawals(authState);
      const list = document.getElementById('withdrawalHistoryList');
      if (!list) return;
      list.innerHTML = '';

      if (!res.requests || res.requests.length === 0) {
        list.innerHTML = '<li class="withdraw-history-empty">0 withdrawals</li>';
        return;
      }

      res.requests.forEach((w) => {
        const li = document.createElement('li');
        li.className = 'withdraw-history-item';

        const statusRaw = String(w.status || 'pending').toLowerCase();
        const status = statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';
        const requestedAt = formatDate(w.createdAt);
        const approvedAt = formatDate(w.approvedAt || w.processedAt || w.paidAt || w.completedAt || w.updatedAt);

        li.innerHTML = `
          <div class="withdraw-history-top">
            <span class="withdraw-history-amount">Rs ${w.amount || 0}</span>
            <span class="withdraw-status-badge ${status}">${status}</span>
          </div>
          <p class="withdraw-history-meta">Requested: ${requestedAt}</p>
          <p class="withdraw-history-meta">Approved: ${status === 'approved' ? approvedAt : '-'}</p>
        `;
        list.appendChild(li);
      });
    } catch (err) {
      console.error('Failed to load withdrawals', err);
    }
  }

  async function initListenerState() {
    try {
      const res = await getListenerProfile(authState);

      if (!res || !res.profile) {
        if (openListenerDashboardBtn) openListenerDashboardBtn.style.display = 'none';
        listenerProfileBtn.style.display = '';
        return;
      }

      const profile = res.profile;

      if (profile.status === 'approved') {
        listenerStatus = 'approved';
        if (openListenerDashboardBtn) openListenerDashboardBtn.style.display = '';
        if (listenerDashboard) {
          document.getElementById("coinsEarned").innerText = profile.totalCoinsEarned || 0;
          document.getElementById("availableCoins").innerText = profile.availableCoins || 0;

          // Sync online status to dashboard toggle button
          const switchBtn = document.getElementById('switchListenerModeBtn');
          if (switchBtn) {
            switchBtn.textContent = profile.isOnline ? 'Go Offline' : 'Go Online';
          }
          syncStatusBadge(!!profile.isOnline);
        }
        listenerProfileBtn.style.display = 'none';
        loadWithdrawalHistory();
        loadListenerRecentCalls();
      } else {
        listenerStatus = 'pending';
        if (openListenerDashboardBtn) openListenerDashboardBtn.style.display = 'none';
        listenerProfileBtn.style.display = '';
        alert('Your listener profile is under review');
      }
    } catch (err) {
      console.error('Listener fetch failed:', err);
      if (openListenerDashboardBtn) openListenerDashboardBtn.style.display = 'none';
      listenerProfileBtn.style.display = '';
    }
  }

  initListenerState();

  const withdrawAmountModal = document.getElementById('withdrawAmountModal');
  const withdrawUpiModal = document.getElementById('withdrawUpiModal');
  const withdrawHistoryModal = document.getElementById('withdrawHistoryModal');
  const withdrawAmountInput = document.getElementById('withdrawAmountInput');
  const withdrawAmountError = document.getElementById('withdrawAmountError');
  const withdrawAmountNextBtn = document.getElementById('withdrawAmountNextBtn');
  const withdrawUpiInput = document.getElementById('withdrawUpiInput');
  const withdrawUpiError = document.getElementById('withdrawUpiError');
  const withdrawSummaryText = document.getElementById('withdrawSummaryText');
  const submitWithdrawBtn = document.getElementById('submitWithdrawBtn');
  const openWithdrawalHistoryBtn = document.getElementById('openWithdrawalHistoryBtn');

  let pendingWithdrawAmount = 0;

  function showAmountError(message) {
    if (!withdrawAmountError) return;
    withdrawAmountError.textContent = message;
    withdrawAmountError.classList.remove('hidden');
  }

  function clearAmountError() {
    if (!withdrawAmountError) return;
    withdrawAmountError.textContent = '';
    withdrawAmountError.classList.add('hidden');
  }

  function showUpiError(message) {
    if (!withdrawUpiError) return;
    withdrawUpiError.textContent = message;
    withdrawUpiError.classList.remove('hidden');
  }

  function clearUpiError() {
    if (!withdrawUpiError) return;
    withdrawUpiError.textContent = '';
    withdrawUpiError.classList.add('hidden');
  }

  [detailsModal, listenerModal, referModal, withdrawAmountModal, withdrawUpiModal, withdrawHistoryModal]
    .filter(Boolean)
    .forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });

  modalCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeModal(document.getElementById(button.dataset.closeModal));
    });
  });

  profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    profileState.name = profileForm.elements.name.value.trim();
    profileState.age = profileForm.elements.age.value.trim();
    // interests already updated via chip clicks
    syncProfileForm();
    closeModal(detailsModal);
    alert('Profile updated successfully.');
  });

  listenerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = listenerForm.elements.listenerName.value.trim();
    const languages = listenerForm.elements.languages.value;
    if (!name || !languages) return;

    listenerState = { name, languages, interests: [...listenerInterests] };

    // Move to step 2
    document.getElementById('listenerStep1').classList.add('hidden');
    document.getElementById('listenerStep2').classList.remove('hidden');
    document.getElementById('listenerTitle').textContent = 'Voice verification';
  });

  // --- Step 2: Voice recognition ---
  let voiceRecorded = false;
  const voiceRecordBtn = document.getElementById('voiceRecordBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  const submitListenerBtn = document.getElementById('submitListenerBtn');
  const approvalStatus = document.getElementById('listenerApprovalStatus');
  const genderRadios = document.querySelectorAll('input[name="listenerGender"]');

  function checkStep2Ready() {
    const genderSelected = document.querySelector('input[name="listenerGender"]:checked');
    submitListenerBtn.disabled = !(voiceRecorded && genderSelected);
  }

  genderRadios.forEach((r) => r.addEventListener('change', checkStep2Ready));

  if (voiceRecordBtn) {
    voiceRecordBtn.addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        voiceStatus.textContent = 'Speech recognition is not supported in this browser.';
        voiceStatus.classList.remove('hidden');
        voiceStatus.className = 'voice-status voice-status--error';
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      voiceRecordBtn.disabled = true;
      voiceRecordBtn.innerHTML = '<span class="voice-record-icon">🎙</span> Listening...';
      voiceStatus.classList.remove('hidden');
      voiceStatus.className = 'voice-status voice-status--recording';
      voiceStatus.textContent = 'Speak now...';

      recognition.start();

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        voiceRecorded = true;
        voiceStatus.className = 'voice-status voice-status--success';
        voiceStatus.textContent = `Voice captured: "${transcript}"`;
        voiceRecordBtn.innerHTML = '<span class="voice-record-icon">✔</span> Voice Recorded';
        checkStep2Ready();
      };

      recognition.onerror = (e) => {
        voiceStatus.className = 'voice-status voice-status--error';
        voiceStatus.textContent = `Error: ${e.error}. Please try again.`;
        voiceRecordBtn.disabled = false;
        voiceRecordBtn.innerHTML = '<span class="voice-record-icon">🎙</span> Tap to Record';
      };

      recognition.onend = () => {
        if (!voiceRecorded) {
          voiceRecordBtn.disabled = false;
          voiceRecordBtn.innerHTML = '<span class="voice-record-icon">🎙</span> Tap to Record';
        }
      };
    });
  }

  if (submitListenerBtn) {
    submitListenerBtn.addEventListener('click', async () => {
      const gender = document.querySelector('input[name="listenerGender"]:checked')?.value;
      listenerState.gender = gender;
      listenerState.voiceVerified = true;

      approvalStatus.classList.remove('hidden');
      if (gender === 'female') {
        approvalStatus.className = 'listener-approval listener-approval--approved';
        approvalStatus.innerHTML = '<span class="approval-icon">✅</span> Submitting profile...';
        submitListenerBtn.classList.add('hidden');

        try {
          await createListenerProfile(authState, {
            displayName: listenerState.name,
            language: listenerState.languages,
            gender: gender,
            interests: listenerState.interests || [],
          });
          listenerStatus = 'approved';
          approvalStatus.innerHTML = '<span class="approval-icon">✅</span> Profile approved! You can start earning.';

          // Update UI: show dashboard button, hide join button
          if (openListenerDashboardBtn) openListenerDashboardBtn.style.display = '';
          if (listenerDashboard) {
            document.getElementById('coinsEarned').textContent = 0;
            document.getElementById('availableCoins').textContent = 0;
          }
          listenerProfileBtn.style.display = 'none';

          setTimeout(() => closeModal(listenerModal), 1500);
        } catch (err) {
          console.error('Listener registration failed:', err);
          approvalStatus.className = 'listener-approval listener-approval--review';
          approvalStatus.innerHTML = '<span class="approval-icon">❌</span> Registration failed. Please try again.';
          submitListenerBtn.classList.remove('hidden');
        }
      } else {
        approvalStatus.className = 'listener-approval listener-approval--review';
        approvalStatus.innerHTML = '<span class="approval-icon">⏳</span> Submitting profile...';
        submitListenerBtn.classList.add('hidden');

        try {
          await createListenerProfile(authState, {
            displayName: listenerState.name,
            language: listenerState.languages,
            gender: gender,
            interests: listenerState.interests || [],
          });
          listenerStatus = 'pending';
          approvalStatus.innerHTML = '<span class="approval-icon">⏳</span> Profile under review. We will notify you soon.';
        } catch (err) {
          console.error('Listener registration failed:', err);
          approvalStatus.className = 'listener-approval listener-approval--review';
          approvalStatus.innerHTML = '<span class="approval-icon">❌</span> Registration failed. Please try again.';
          submitListenerBtn.classList.remove('hidden');
        }
      }
    });
  }

  // Reset listener modal when closed
  const listenerCloseObserver = new MutationObserver(() => {
    if (listenerModal.classList.contains('hidden')) {
      document.getElementById('listenerStep1').classList.remove('hidden');
      document.getElementById('listenerStep2').classList.add('hidden');
      document.getElementById('listenerTitle').textContent = 'Create listener profile';
      voiceRecorded = false;
      listenerInterests = [];
      syncListenerChips();
      if (voiceRecordBtn) {
        voiceRecordBtn.disabled = false;
        voiceRecordBtn.innerHTML = '<span class="voice-record-icon">🎙</span> Tap to Record';
      }
      if (voiceStatus) { voiceStatus.classList.add('hidden'); voiceStatus.textContent = ''; }
      if (submitListenerBtn) { submitListenerBtn.disabled = true; submitListenerBtn.classList.remove('hidden'); }
      if (approvalStatus) { approvalStatus.classList.add('hidden'); }
      genderRadios.forEach((r) => { r.checked = false; });
    }
  });
  listenerCloseObserver.observe(listenerModal, { attributes: true, attributeFilter: ['class'] });

  copyReferralBtn.addEventListener('click', async () => {
    const referralCode = document.getElementById('referralCodeText').textContent.trim();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralCode);
        alert('Referral code copied. Share it to earn coins.');
        return;
      }
    } catch {
      // Fall through to alert-based fallback.
    }

    alert(`Referral code: ${referralCode}`);
  });

  if (withdrawBtn && withdrawAmountModal) {
    withdrawBtn.addEventListener('click', () => {
      pendingWithdrawAmount = 0;
      clearAmountError();
      clearUpiError();
      if (withdrawAmountInput) withdrawAmountInput.value = '';
      if (withdrawUpiInput) withdrawUpiInput.value = '';
      openModal(withdrawAmountModal);
    });
  }

  if (withdrawAmountNextBtn) {
    withdrawAmountNextBtn.addEventListener('click', () => {
      clearAmountError();
      const enteredAmount = Number(withdrawAmountInput?.value || 0);

      if (!Number.isFinite(enteredAmount) || enteredAmount < 1000) {
        showAmountError('Minimum withdrawal is Rs 1000.');
        return;
      }

      const availableCoins = parseCoins(document.getElementById('availableCoins')?.innerText);
      if (enteredAmount > availableCoins) {
        showAmountError(`You only have ${availableCoins} available coins.`);
        return;
      }

      pendingWithdrawAmount = enteredAmount;
      if (withdrawSummaryText) {
        withdrawSummaryText.textContent = `Amount: Rs ${pendingWithdrawAmount}. Enter your UPI ID to continue.`;
      }
      closeModal(withdrawAmountModal);
      if (withdrawUpiModal) openModal(withdrawUpiModal);
    });
  }

  if (submitWithdrawBtn) {
    submitWithdrawBtn.addEventListener('click', async () => {
      clearUpiError();
      const upiId = String(withdrawUpiInput?.value || '').trim();
      if (!upiId) {
        showUpiError('Please enter a valid UPI ID.');
        return;
      }

      try {
        await createWithdrawal(authState, pendingWithdrawAmount, upiId);

        try {
          const res = await getListenerProfile(authState);
          if (res?.profile) {
            document.getElementById('availableCoins').textContent = res.profile.availableCoins || 0;
            document.getElementById('coinsEarned').textContent = res.profile.totalCoinsEarned || 0;
          }
        } catch (_) { /* ignore refresh failure */ }

        const withdrawMsg = document.getElementById('withdrawMsg');
        if (withdrawMsg) {
          withdrawMsg.textContent = 'Withdrawal requested. Money will be credited within 24 hours.';
        }

        closeModal(withdrawUpiModal);
        await loadWithdrawalHistory();
      } catch (err) {
        console.error(err);
        showUpiError('Withdrawal failed. Please try again.');
      }
    });
  }

  if (openWithdrawalHistoryBtn && withdrawHistoryModal) {
    openWithdrawalHistoryBtn.addEventListener('click', async () => {
      const list = document.getElementById('withdrawalHistoryList');
      if (list) list.innerHTML = '<li class="withdraw-history-empty">Loading...</li>';
      openModal(withdrawHistoryModal);
      await loadWithdrawalHistory();
    });
  }

  logoutBtn.addEventListener('click', onLogout);

  syncProfileForm();
}