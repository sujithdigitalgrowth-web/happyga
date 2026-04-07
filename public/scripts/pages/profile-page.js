import { createWithdrawal, createListenerProfile, getListenerProfile, getWithdrawals } from '../services/api.js';

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
    interests: 'Coffee dates, long drives, tech talks',
  };

  let listenerState = null;

  function openModal(modal) {
    modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
  }

  function syncProfileForm() {
    profileForm.elements.name.value = profileState.name;
    profileForm.elements.age.value = profileState.age;
    profileForm.elements.interests.value = profileState.interests;
    profileSummaryText.textContent = `${profileState.name}, ${profileState.age} • ${profileState.interests}`;
  }

  personalDetailsBtn.addEventListener('click', () => openModal(detailsModal));
  listenerProfileBtn.addEventListener('click', () => openModal(listenerModal));
  referFriendBtn.addEventListener('click', () => openModal(referModal));

  let listenerStatus = 'not_registered'; // 'not_registered' | 'pending' | 'approved'
  const listenerDashboard = document.getElementById('listenerDashboard');

  async function loadWithdrawalHistory() {
    try {
      const res = await getWithdrawals(authState);
      const list = document.getElementById('withdrawalList');
      list.innerHTML = '';

      if (!res.requests || res.requests.length === 0) {
        list.innerHTML = '<li>No withdrawals yet</li>';
        return;
      }

      res.requests.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = `₹${w.amount} - ${w.status} - ${new Date(w.createdAt).toLocaleString()}`;
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
        if (listenerDashboard) listenerDashboard.style.display = 'none';
        listenerProfileBtn.style.display = '';
        return;
      }

      const profile = res.profile;

      if (profile.status === 'approved') {
        listenerStatus = 'approved';
        if (listenerDashboard) {
          listenerDashboard.style.display = 'block';
          document.getElementById('coinsEarned').textContent = profile.totalCoinsEarned || 0;
          document.getElementById('availableCoins').textContent = profile.availableCoins || 0;
        }
        listenerProfileBtn.style.display = 'none';
        loadWithdrawalHistory();
      } else {
        listenerStatus = 'pending';
        if (listenerDashboard) listenerDashboard.style.display = 'none';
        listenerProfileBtn.style.display = '';
        alert('Your listener profile is under review');
      }
    } catch (err) {
      console.error('Listener fetch failed:', err);
      if (listenerDashboard) listenerDashboard.style.display = 'none';
      listenerProfileBtn.style.display = '';
    }
  }

  initListenerState();

  [detailsModal, listenerModal, referModal].forEach((modal) => {
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
    profileState.interests = profileForm.elements.interests.value.trim();
    syncProfileForm();
    closeModal(detailsModal);
    alert('Profile updated successfully.');
  });

  listenerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = listenerForm.elements.listenerName.value.trim();
    const languages = listenerForm.elements.languages.value;
    const about = listenerForm.elements.about.value.trim();
    if (!name || !languages || !about) return;

    listenerState = { name, languages, about };

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
            bio: listenerState.about,
            gender: gender,
          });
          listenerStatus = 'approved';
          approvalStatus.innerHTML = '<span class="approval-icon">✅</span> Profile approved! You can start earning.';

          // Update UI: show dashboard, hide join button
          if (listenerDashboard) {
            listenerDashboard.style.display = 'block';
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
            bio: listenerState.about,
            gender: gender,
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

  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', async () => {
      const amount = prompt('Enter amount (min 1000):');
      const upiId = prompt('Enter your UPI ID:');

      if (!amount || !upiId) {
        alert('All fields required');
        return;
      }

      const amt = Number(amount);
      if (isNaN(amt) || amt < 1000) {
        alert('Minimum withdrawal is 1000');
        return;
      }

      try {
        await createWithdrawal(authState, amt, upiId);

        // Refresh dashboard with updated coins
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
        loadWithdrawalHistory();
      } catch (err) {
        console.error(err);
        alert('Withdrawal failed');
      }
    });
  }

  logoutBtn.addEventListener('click', onLogout);

  syncProfileForm();
}