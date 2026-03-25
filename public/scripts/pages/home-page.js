import { rawProfiles } from '../data/profiles.js';
import { createProfiles } from '../utils/profile-images.js';

export function createHomePage({ listElement, onStartCall }) {
  const profiles = createProfiles(rawProfiles);

  function handleProfileImageError(event) {
    const image = event.currentTarget;
    const altAiImage = image.dataset.altAiImage;
    const fallbackImage = image.dataset.fallbackImage;

    if (altAiImage && image.src !== altAiImage && image.dataset.aiRetryDone !== 'true') {
      image.dataset.aiRetryDone = 'true';
      image.src = altAiImage;
      image.addEventListener('error', handleProfileImageError, { once: true });
      return;
    }

    if (fallbackImage && image.src !== fallbackImage) {
      image.src = fallbackImage;
    }
  }

  function renderProfiles() {
    const sortedProfiles = [...profiles].sort((left, right) => {
      if (left.isOnline !== right.isOnline) {
        return left.isOnline ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    listElement.innerHTML = sortedProfiles
      .map(
        (profile) => `
        <article class="profile-card card">
          <img class="profile-image" src="${profile.image}" data-alt-ai-image="${profile.altAiImage}" data-fallback-image="${profile.fallbackImage}" alt="AI character of ${profile.name}" loading="lazy" />
          <div class="profile-content">
            <div class="profile-copy">
              <div class="profile-heading">
                <h2>${profile.name}, ${profile.age}</h2>
                <span class="presence-chip ${profile.isOnline ? 'online' : 'offline'}">
                  <span class="presence-dot" aria-hidden="true"></span>
                  ${profile.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p class="username">@${profile.username}</p>
              <p class="bio">${profile.bio}</p>
            </div>
            <button class="call-btn" data-user="${profile.username}" type="button" aria-label="Call ${profile.name}">
              <img class="call-btn-icon" src="assets/icons/call-button.svg" alt="" />
            </button>
          </div>
        </article>
      `,
      )
      .join('');

    listElement.querySelectorAll('.profile-image').forEach((image) => {
      image.addEventListener('error', handleProfileImageError, { once: true });
    });
  }

  listElement.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-user]');
    if (!button) {
      return;
    }

    const selectedProfile = profiles.find((profile) => profile.username === button.dataset.user);
    if (!selectedProfile) {
      return;
    }

    await onStartCall(selectedProfile, button);
  });

  renderProfiles();

  return {
    getCallButtons() {
      return Array.from(listElement.querySelectorAll('.call-btn[data-user]'));
    },
  };
}