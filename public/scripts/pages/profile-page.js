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
    listenerState = {
      name: listenerForm.elements.listenerName.value.trim(),
      languages: listenerForm.elements.languages.value.trim(),
      about: listenerForm.elements.about.value.trim(),
    };
    closeModal(listenerModal);
    alert(`Listener profile created for ${listenerState.name}. You can earn 40% of user coin spend.`);
  });

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