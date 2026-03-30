import { loadFragments } from './shared/fragment-loader.js';
import { writeAuthState } from './services/auth.js';

function getNativeFirebaseAuthPlugin() {
  const capacitor = window.Capacitor;
  if (!capacitor || !capacitor.isNativePlatform?.()) return null;
  return capacitor.Plugins?.FirebaseAuthentication || null;
}

function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function normalizePhone(value) {
  return String(value).replace(/\D/g, '').slice(-10);
}

function isLocalDebugHost() {
  const host = window.location.hostname;
  return host === 'localhost' ||
    host === '127.0.0.1' ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function getOtpErrorMessage(error, isNative = false) {
  const code = error?.code || error?.message || '';
  const normalizedCode = String(code).toLowerCase();
  let message = error?.message || 'OTP request failed. Please try again.';

  if (normalizedCode.includes('auth/invalid-phone-number')) {
    message = 'Phone number format is invalid. Use a valid 10-digit Indian mobile number.';
  }
  else if (normalizedCode.includes('auth/missing-phone-number')) {
    message = 'Phone number is missing. Enter your number and try again.';
  }
  else if (normalizedCode.includes('auth/too-many-requests')) {
    message = 'Too many attempts. Wait a few minutes before requesting OTP again.';
  }
  else if (normalizedCode.includes('auth/quota-exceeded')) {
    message = 'SMS quota exceeded in Firebase. Increase quota or wait and retry later.';
  }
  else if (normalizedCode.includes('auth/captcha-check-failed')) {
    message = 'reCAPTCHA verification failed. Refresh and try sending OTP again.';
  }
  else if (normalizedCode.includes('auth/invalid-app-credential')) {
    message = isNative
      ? 'Android app credentials are invalid. Add SHA-1/SHA-256 in Firebase project settings and rebuild.'
      : 'App credential is invalid. Ensure this domain is authorized in Firebase Authentication settings.';
  }
  else if (normalizedCode.includes('auth/unauthorized-domain')) {
    message = 'This domain is not authorized in Firebase. Add localhost and your LAN IP in Firebase Auth -> Settings -> Authorized domains.';
  }
  else if (normalizedCode.includes('auth/operation-not-allowed')) {
    message = 'Phone sign-in is disabled. Enable Phone provider in Firebase Authentication -> Sign-in method.';
  }
  else if (normalizedCode.includes('auth/invalid-verification-code')) {
    message = 'Incorrect OTP. Please try again.';
  }
  else if (normalizedCode.includes('auth/code-expired')) {
    message = 'OTP expired. Tap Resend OTP and enter the latest code.';
  }

  if (!isLocalDebugHost() || !code) {
    return message;
  }

  return `${message} [${code}]`;
}

async function init() {
  await loadFragments();

  const phoneForm = document.getElementById('phoneForm');
  const otpForm = document.getElementById('otpForm');
  const phoneInput = document.getElementById('phoneInput');
  const otpInput = document.getElementById('otpInput');
  const otpHint = document.getElementById('otpHint');
  const statusText = document.getElementById('statusText');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const sendOtpBtn = document.getElementById('sendOtpBtn');

  let confirmationResult = null;
  let nativeVerificationId = '';
  let currentPhone = '';
  const nativeApp = isNativeApp();
  const nativeFirebaseAuth = getNativeFirebaseAuthPlugin();

  function showStatus(message) {
    statusText.textContent = message;
  }

  if (!nativeApp) {
    sendOtpBtn.disabled = true;
    phoneInput.disabled = true;
    showStatus('OTP is enabled only in the Android app build. Open the app on device/emulator to continue.');
  }

  async function completeLogin({ uid, phoneNumber, getToken }) {
    const idToken = await getToken();
    writeAuthState({
      phone: phoneNumber || (currentPhone ? `+91${currentPhone}` : null),
      uid,
      mode: 'firebase',
      idToken,
      verifiedAt: new Date().toISOString(),
    });
    showStatus('Login successful. Redirecting...');
    window.location.href = 'index.html';
  }

  async function setupNativePhoneListeners() {
    if (!nativeFirebaseAuth) return;

    await nativeFirebaseAuth.removeAllListeners();

    await nativeFirebaseAuth.addListener('phoneCodeSent', (event) => {
      nativeVerificationId = event.verificationId;
      otpForm.classList.remove('hidden');
      otpHint.textContent = `OTP sent to +91 ${currentPhone}`;
      showStatus('');
      otpInput.value = '';
      otpInput.focus();
    });

    await nativeFirebaseAuth.addListener('phoneVerificationCompleted', async (event) => {
      await completeLogin({
        uid: event.result?.user?.uid,
        phoneNumber: event.result?.user?.phoneNumber,
        getToken: async () => {
          const tokenResult = await nativeFirebaseAuth.getIdToken({ forceRefresh: true });
          return tokenResult.token;
        },
      });
    });

    await nativeFirebaseAuth.addListener('phoneVerificationFailed', (event) => {
      console.error('Native phone verification failed:', event);
      showStatus(getOtpErrorMessage(event, true));
    });
  }

  async function sendOtp(phone) {
    showStatus('Sending OTP...');
    currentPhone = phone;

    if (!nativeApp) {
      showStatus('OTP is enabled only in the Android app build.');
      return;
    }

    if (!nativeFirebaseAuth) {
      showStatus('Native phone authentication is unavailable. Run cap sync and rebuild the app.');
      return;
    }

    try {
      await setupNativePhoneListeners();
      await nativeFirebaseAuth.signInWithPhoneNumber({
        phoneNumber: `+91${phone}`,
      });
    } catch (err) {
      console.error('Native OTP send error:', err);
      showStatus(getOtpErrorMessage(err, true));
    }
  }

  phoneForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = normalizePhone(phoneInput.value);
    if (phone.length !== 10) {
      showStatus('Enter a valid 10-digit phone number.');
      phoneInput.focus();
      return;
    }
    await sendOtp(phone);
  });

  otpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const enteredOtp = String(otpInput.value).replace(/\D/g, '');
    if (enteredOtp.length !== 6) {
      showStatus('Enter the 6-digit OTP.');
      otpInput.focus();
      return;
    }

    if (nativeApp && !nativeFirebaseAuth) {
      showStatus('Native phone authentication is unavailable. Run cap sync and rebuild the app.');
      return;
    }

    if (!nativeVerificationId) {
      showStatus('Request OTP first.');
      return;
    }

    showStatus('Verifying...');
    try {
      const result = await nativeFirebaseAuth.confirmVerificationCode({
        verificationId: nativeVerificationId,
        verificationCode: enteredOtp,
      });
      await completeLogin({
        uid: result.user?.uid,
        phoneNumber: result.user?.phoneNumber,
        getToken: async () => {
          const tokenResult = await nativeFirebaseAuth.getIdToken({ forceRefresh: true });
          return tokenResult.token;
        },
      });
    } catch (err) {
      console.error('OTP verification error:', err);
      showStatus(getOtpErrorMessage(err, true));
    }
  });

  resendOtpBtn.addEventListener('click', async () => {
    const phone = currentPhone || normalizePhone(phoneInput.value);
    if (!phone || phone.length !== 10) {
      showStatus('Enter your phone number first.');
      return;
    }
    await sendOtp(phone);
  });
}

init().catch((error) => {
  const statusText = document.getElementById('statusText');
  if (statusText) statusText.textContent = error.message;
});