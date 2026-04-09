(() => {
  const AUTH_KEY = 'happyga_auth';
  const path = window.location.pathname.toLowerCase();
  const isLoginPage = path.endsWith('/login.html') || path.endsWith('login.html');

  console.log('[auth-guard] path:', path, 'isLoginPage:', isLoginPage);

  function hasValidAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      console.log('[auth-guard] raw auth:', raw);
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
  console.log('[auth-guard] authenticated:', authenticated);

  if (!authenticated && !isLoginPage) {
    console.log('[auth-guard] Redirecting to login.html');
    window.location.replace('login.html');
    return;
  }

  if (authenticated && isLoginPage) {
    console.log('[auth-guard] Already authenticated, redirecting to index.html');
    window.location.replace('index.html');
  }
})();
