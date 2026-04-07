export function createProfilePage({
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
    submitListenerBtn.addEventListener('click', () => {
      const gender = document.querySelector('input[name="listenerGender"]:checked')?.value;
      listenerState.gender = gender;
      listenerState.voiceVerified = true;

      approvalStatus.classList.remove('hidden');
      if (gender === 'female') {
        approvalStatus.className = 'listener-approval listener-approval--approved';
        approvalStatus.innerHTML = '<span class="approval-icon">✅</span> Profile approved! Selecting avatar...';
        submitListenerBtn.classList.add('hidden');
        // Move to step 3 after a short delay
        setTimeout(() => {
          document.getElementById('listenerStep2').classList.add('hidden');
          document.getElementById('listenerStep3').classList.remove('hidden');
          document.getElementById('listenerTitle').textContent = 'Choose profile image';
        }, 1200);
      } else {
        approvalStatus.className = 'listener-approval listener-approval--review';
        approvalStatus.innerHTML = '<span class="approval-icon">⏳</span> Profile under review. We will notify you soon.';
        submitListenerBtn.classList.add('hidden');
      }
    });
  }

  // --- Step 3: Avatar selection ---
  const confirmAvatarBtn = document.getElementById('confirmAvatarBtn');
  const avatarRadios = document.querySelectorAll('input[name="listenerAvatar"]');

  avatarRadios.forEach((r) => r.addEventListener('change', () => {
    if (confirmAvatarBtn) confirmAvatarBtn.disabled = false;
  }));

  if (confirmAvatarBtn) {
    confirmAvatarBtn.addEventListener('click', () => {
      const selected = document.querySelector('input[name="listenerAvatar"]:checked')?.value;
      if (!selected) return;
      listenerState.avatar = selected;
      closeModal(listenerModal);
      alert(`Listener profile created for ${listenerState.name}! Your profile is now live.`);
    });
  }

  // Reset listener modal when closed
  const listenerCloseObserver = new MutationObserver(() => {
    if (listenerModal.classList.contains('hidden')) {
      document.getElementById('listenerStep1').classList.remove('hidden');
      document.getElementById('listenerStep2').classList.add('hidden');
      document.getElementById('listenerStep3').classList.add('hidden');
      document.getElementById('listenerTitle').textContent = 'Create listener profile';
      voiceRecorded = false;
      if (voiceRecordBtn) {
        voiceRecordBtn.disabled = false;
        voiceRecordBtn.innerHTML = '<span class="voice-record-icon">🎙</span> Tap to Record';
      }
      if (voiceStatus) { voiceStatus.classList.add('hidden'); voiceStatus.textContent = ''; }
      if (submitListenerBtn) { submitListenerBtn.disabled = true; submitListenerBtn.classList.remove('hidden'); }
      if (approvalStatus) { approvalStatus.classList.add('hidden'); }
      if (confirmAvatarBtn) { confirmAvatarBtn.disabled = true; }
      genderRadios.forEach((r) => { r.checked = false; });
      avatarRadios.forEach((r) => { r.checked = false; });
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

  logoutBtn.addEventListener('click', onLogout);

  syncProfileForm();
}