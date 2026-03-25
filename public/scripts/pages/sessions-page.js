export function createSessionsPage({ listElement }) {
  let sessions = [];

  function renderSessions() {
    if (!sessions.length) {
      listElement.innerHTML = '<p class="empty-state">No sessions yet. Start a call from Home to see it here.</p>';
      return;
    }

    listElement.innerHTML = sessions
      .map(
        (session) => `
        <article class="session-item">
          <div class="session-avatar" aria-hidden="true">${session.name.charAt(0)}</div>
          <div>
            <p class="session-name">${session.name}</p>
            <p class="session-meta">@${session.username} • ${session.when}</p>
          </div>
          <div class="session-duration">${session.duration}</div>
        </article>
      `,
      )
      .join('');
  }

  function setSessions(nextSessions) {
    sessions = Array.isArray(nextSessions) ? [...nextSessions] : [];
    renderSessions();
  }

  function addSession(session) {
    sessions = [session, ...sessions];
    renderSessions();
    return session;
  }

  renderSessions();

  return {
    addSession,
    setSessions,
  };
}