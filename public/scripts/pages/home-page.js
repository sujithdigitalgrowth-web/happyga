import { rawProfiles } from '../data/profiles.js';
import { createProfiles } from '../utils/profile-images.js';
import { getListeners } from '../services/api.js';

export function createHomePage({ listElement, onStartCall, authState }) {
  const exampleProfiles = createProfiles(rawProfiles);
  let profiles = exampleProfiles;

  function handleProfileImageError(event) {
    const image = event.currentTarget;
    const fallbackImage = image.dataset.fallbackImage;

    if (fallbackImage && image.src !== fallbackImage) {
      image.src = fallbackImage;
    }
  }

  function renderProfiles() {
    if (!profiles.length) {
      listElement.innerHTML = '<p class="empty-state">No listeners are online right now</p>';
      return;
    }

    const sortedProfiles = [...profiles].sort((left, right) => {
      if (left.isOnline !== right.isOnline) {
        return left.isOnline ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    listElement.innerHTML = sortedProfiles
      .map(
        (profile) => {
          console.log("Rendering profile:", profile);
          return `
        <article class="profile-card card">
          <img class="profile-image" src="${profile.image}" data-fallback-image="${profile.fallbackImage}" alt="Profile picture of ${profile.name}" loading="lazy" />
          <div class="profile-content">
            <div class="profile-copy">
              <div class="profile-heading">
                <h2>${profile.age ? `${profile.name}, ${profile.age}` : profile.name}</h2>
                <span class="presence-chip ${profile.isOnline ? 'online' : 'offline'}">
                  <span class="presence-dot" aria-hidden="true"></span>
                  ${profile.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p class="bio">${profile.bio}</p>
            </div>
            <button class="call-btn" data-user="${profile.username}" type="button" aria-label="Call ${profile.name}" ${profile.isOnline ? '' : 'disabled aria-disabled="true"'}>
              <img class="call-btn-icon" src="${profile.isOnline ? 'assets/icons/call-button-green.svg' : 'assets/icons/call-button.svg'}" alt="" />
            </button>
          </div>
        </article>
      `;
        },
      )
      .join('');

    listElement.querySelectorAll('.profile-image').forEach((image) => {
      image.addEventListener('error', handleProfileImageError, { once: true });
    });
  }

  function normalizeListenersFromApi(listeners) {
    return listeners.map((listener) => {
      const resolvedName = String(listener.displayName || listener.name || '').trim();
      const generatedUsername = `@${(resolvedName || 'listener').toLowerCase().replace(/\s+/g, '')}`;
      const image = listener.avatar || 'profile-assets/listener-1.png';

      return {
        id: listener.uid,
        name: resolvedName || 'Listener',
        age: listener.age ? String(listener.age) : '',
        username: listener.username || generatedUsername,
        bio: listener.bio || '',
        image,
        fallbackImage: image,
        isOnline: !!listener.isOnline,
      };
    });
  }

  async function loadListeners() {
    try {
      const response = await getListeners(authState);
      const payload = await response.json();
      const listeners = Array.isArray(payload?.listeners) ? payload.listeners : [];
      console.log("API listeners raw:", listeners);

      const mappedListeners = normalizeListenersFromApi(listeners);
      console.log("API listeners mapped:", mappedListeners);

      profiles = [...mappedListeners, ...exampleProfiles];
      renderProfiles();
    } catch (error) {
      console.error('Failed to load listeners, showing fallback profiles.', error);
      profiles = exampleProfiles;
      renderProfiles();
    }
  }

  listElement.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-user]');
    if (!button || button.disabled) {
      return;
    }

    const selectedProfile = profiles.find((profile) => profile.username === button.dataset.user);
    if (!selectedProfile) {
      return;
    }

    localStorage.setItem('selectedListenerId', selectedProfile.id || '');
    localStorage.setItem('selectedListenerName', selectedProfile.name || '');

    await onStartCall(selectedProfile, button);
  });

  loadListeners();

  return {
    getCallButtons() {
      return Array.from(listElement.querySelectorAll('.call-btn[data-user]'));
    },
  };
}