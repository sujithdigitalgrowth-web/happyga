(() => {
  const AUTH_KEY = 'happyga_auth';
  const path = window.location.pathname.toLowerCase();
  const isLoginPage = path.endsWith('/login.html') || path.endsWith('login.html');

  function hasValidAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw);
      return Boolean(parsed && parsed.phone);
    } catch (error) {
      return false;
    }
  }

  const authenticated = hasValidAuth();

  if (!authenticated && !isLoginPage) {
    window.location.href = 'login.html';
    return;
  }

  if (authenticated && isLoginPage) {
    window.location.href = 'index.html';
  }
})();
