export function createSessionsPage({ listElement }) {
  let sessions = [];

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDuration(sec) {
    if (!sec || sec <= 0) return '0 sec';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s} sec`;
  }

  function formatTime(raw) {
    if (!raw) return '';
    try {
      const d = raw._seconds ? new Date(raw._seconds * 1000) : new Date(raw);
      if (isNaN(d.getTime())) return String(raw);
      return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return String(raw);
    }
  }

  function statusLabel(s, duration, connected) {
    // Use connected field if available for precise disambiguation
    if (connected === false && (!duration || duration <= 0)) return 'Missed';
    if (s === 'completed' && (!duration || duration <= 0)) return 'Missed';
    const map = {
      completed: 'Completed',
      connected: 'Completed',
      busy: 'Busy',
      'no-answer': 'Missed',
      failed: 'Failed',
      canceled: 'Canceled',
      missed: 'Missed',
      initiated: 'Not connected',
      ringing: 'Not connected',
    };
    return map[s] || s || 'Unknown';
  }

  function statusClass(s, duration, connected) {
    if (connected === true || (s === 'completed' && duration > 0)) return 'session-status-ok';
    return 'session-status-fail';
  }

  function renderSession(session) {
    // Support both new backend sessions and legacy frontend-saved sessions
    const name = session.listenerName || session.name || 'Unknown';
    const initial = name.charAt(0).toUpperCase();
    const status = session.finalStatus || null;
    const duration = session.durationSeconds;
    const connected = session.connected;
    const coins = session.chargedCoins;
    const lowBal = session.endedDueToLowBalance;
    const time = formatTime(session.completedAt || session.createdAt || null);
    const legacy = !status && !duration && duration !== 0;

    if (legacy) {
      // Render old-format session
      return `
        <article class="session-item">
          <div class="session-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
          <div class="session-body">
            <p class="session-name">${escapeHtml(name)}</p>
            ${session.username ? `<p class="session-meta">@${escapeHtml(session.username)}</p>` : ''}
            ${session.when ? `<p class="session-meta">${escapeHtml(session.when)}</p>` : ''}
          </div>
          ${session.duration ? `<div class="session-duration">${escapeHtml(session.duration)}</div>` : ''}
        </article>`;
    }

    return `
      <article class="session-item">
        <div class="session-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
        <div class="session-body">
          <p class="session-name">${escapeHtml(name)}</p>
          <p class="session-status ${statusClass(status, duration, connected)}">${escapeHtml(statusLabel(status, duration, connected))}</p>
          ${duration > 0 ? `<p class="session-meta">Duration: ${formatDuration(duration)}</p>` : ''}
          ${coins > 0 ? `<p class="session-meta">Coins used: ${coins}</p>` : coins === 0 && status ? `<p class="session-meta">Coins used: 0</p>` : ''}
          ${lowBal ? '<p class="session-low-balance">Ended due to low balance</p>' : ''}
          ${time ? `<p class="session-time">${escapeHtml(time)}</p>` : ''}
        </div>
      </article>`;
  }

  function renderSessions() {
    if (!sessions.length) {
      listElement.innerHTML = '<p class="empty-state">No sessions yet. Start a call from Home to see it here.</p>';
      return;
    }

    listElement.innerHTML = sessions.map(renderSession).join('');
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