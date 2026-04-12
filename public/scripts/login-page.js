import { loadFragments } from './shared/fragment-loader.js';
import { writeAuthState } from './services/auth.js';
import { fetchWallet } from './services/api.js';
import { firebaseAuth } from './firebase.js';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

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
    message = 'This domain is not authorized in Firebase. Add your deployment domain in Firebase Console -> Authentication -> Settings -> Authorized domains.';
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

  if (isNative && code) {
    return `${message} [${code}]`;
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
  const phoneStep = document.getElementById('phoneStep');
  const otpStep = document.getElementById('otpStep');
  const changeNumberBtn = document.getElementById('changeNumberBtn');

  let confirmationResult = null;
  let nativeVerificationId = '';
  let currentPhone = '';
  const nativeApp = isNativeApp();
  const nativeFirebaseAuth = getNativeFirebaseAuthPlugin();
  let recaptchaVerifier = null;

  function showStatus(message) {
    statusText.textContent = message;
  }

  // Setup reCAPTCHA for web (non-native) on production domains
  function ensureRecaptchaVerifier() {
    if (recaptchaVerifier) return recaptchaVerifier;
    recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'sendOtpBtn', {
      size: 'invisible',
      callback: () => { /* solved */ },
      'expired-callback': () => {
        recaptchaVerifier = null;
        showStatus('reCAPTCHA expired. Try sending OTP again.');
      },
    });
    return recaptchaVerifier;
  }

  if (!nativeApp) {
    if (isLocalDebugHost()) {
      showStatus('Use your phone number to receive an OTP.');
    }
    // Production web — keep form enabled, use reCAPTCHA + Firebase Web SDK
  }

  async function completeLogin({ uid, phoneNumber, getToken }) {
    console.log('[DEBUG-LOGIN] completeLogin called — uid:', uid, 'phoneNumber:', phoneNumber);
    let idToken;
    try {
      idToken = await getToken();
      console.log('[DEBUG-LOGIN] ID token retrieved — length:', idToken?.length, 'starts:', idToken?.substring(0, 30));
    } catch (tokenErr) {
      console.error('[DEBUG-LOGIN] getToken() FAILED:', tokenErr);
      showStatus('Login failed: could not retrieve auth token.');
      return;
    }
    if (!uid) console.warn('[DEBUG-LOGIN] uid is MISSING — auth state may be incomplete');
    if (!idToken) console.warn('[DEBUG-LOGIN] idToken is MISSING — API calls will fail');
    const authState = {
      phone: phoneNumber || (currentPhone ? `+91${currentPhone}` : null),
      uid,
      mode: 'firebase',
      idToken,
      verifiedAt: new Date().toISOString(),
    };
    console.log('[DEBUG-LOGIN] Writing auth state:', JSON.stringify({ ...authState, idToken: idToken ? `${idToken.substring(0, 20)}...` : null }));
    writeAuthState(authState);

    // Bootstrap: call /api/wallet immediately to create users/{uid} doc in Firestore.
    // This is critical for native APK users whose first page load may fail silently.
    try {
      console.log('[DEBUG-LOGIN] Calling /api/wallet to bootstrap user doc...');
      const wallet = await fetchWallet(authState);
      console.log('[DEBUG-LOGIN] Wallet bootstrap SUCCESS:', JSON.stringify(wallet));
    } catch (walletErr) {
      // Log loudly but don't block login — user doc creation will be retried on main page.
      console.error('[DEBUG-LOGIN] Wallet bootstrap FAILED:', walletErr?.message || walletErr);
      console.error('[DEBUG-LOGIN] User doc may NOT have been created in Firestore!');
    }

    showStatus('Login successful. Redirecting...');
    window.location.href = 'index.html';
  }

  async function setupNativePhoneListeners() {
    if (!nativeFirebaseAuth) return;

    await nativeFirebaseAuth.removeAllListeners();

    await nativeFirebaseAuth.addListener('phoneCodeSent', (event) => {
      nativeVerificationId = event.verificationId;
      phoneStep.classList.add('hidden');
      otpStep.classList.remove('hidden');
      otpHint.textContent = `OTP sent to +91 ${currentPhone}`;
      showStatus('');
      otpInput.value = '';
      otpInput.focus();
    });

    await nativeFirebaseAuth.addListener('phoneVerificationCompleted', async (event) => {
      console.log('[DEBUG-LOGIN] phoneVerificationCompleted event:', JSON.stringify(event, null, 2));
      console.log('[DEBUG-LOGIN] event.result:', event.result);
      console.log('[DEBUG-LOGIN] event.result?.user:', event.result?.user);
      console.log('[DEBUG-LOGIN] uid:', event.result?.user?.uid, 'phone:', event.result?.user?.phoneNumber);
      await completeLogin({
        uid: event.result?.user?.uid,
        phoneNumber: event.result?.user?.phoneNumber,
        getToken: async () => {
          const tokenResult = await nativeFirebaseAuth.getIdToken({ forceRefresh: true });
          console.log('[DEBUG-LOGIN] getIdToken result keys:', Object.keys(tokenResult || {}));
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

    // Native Capacitor app — use native Firebase plugin
    if (nativeApp) {
      if (!nativeFirebaseAuth) {
        showStatus('Native phone authentication is unavailable. Run cap sync and rebuild the app.');
        return;
      }

      try {
        await setupNativePhoneListeners();

        // Timeout: if no response in 20s, show error
        const otpTimeout = setTimeout(() => {
          if (!nativeVerificationId) {
            showStatus('OTP request timed out. Check your internet connection and try again.');
            sendOtpBtn.disabled = false;
          }
        }, 20000);

        await nativeFirebaseAuth.signInWithPhoneNumber({
          phoneNumber: `+91${phone}`,
        });

        clearTimeout(otpTimeout);
      } catch (err) {
        console.error('Native OTP send error:', err);
        showStatus(getOtpErrorMessage(err, true));
      }
      return;
    }

    // Web browser — use Firebase Web SDK + reCAPTCHA
    try {
      const verifier = ensureRecaptchaVerifier();
      confirmationResult = await signInWithPhoneNumber(firebaseAuth, `+91${phone}`, verifier);
      phoneStep.classList.add('hidden');
      otpStep.classList.remove('hidden');
      otpHint.textContent = `OTP sent to +91 ${phone}`;
      showStatus('');
      otpInput.value = '';
      otpInput.focus();
    } catch (err) {
      console.error('Web OTP send error:', err);
      // Reset reCAPTCHA on failure so it can be re-created
      recaptchaVerifier = null;
      showStatus(getOtpErrorMessage(err, false));
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

    showStatus('Verifying...');

    // Web browser — use confirmationResult from signInWithPhoneNumber
    if (!nativeApp && confirmationResult) {
      try {
        const result = await confirmationResult.confirm(enteredOtp);
        await completeLogin({
          uid: result.user?.uid,
          phoneNumber: result.user?.phoneNumber,
          getToken: () => result.user.getIdToken(true),
        });
      } catch (err) {
        console.error('Web OTP verification error:', err);
        showStatus(getOtpErrorMessage(err, false));
      }
      return;
    }

    // Native Capacitor — use confirmVerificationCode
    if (nativeApp && !nativeFirebaseAuth) {
      showStatus('Native phone authentication is unavailable. Run cap sync and rebuild the app.');
      return;
    }

    if (!nativeVerificationId) {
      showStatus('Request OTP first.');
      return;
    }

    try {
      const result = await nativeFirebaseAuth.confirmVerificationCode({
        verificationId: nativeVerificationId,
        verificationCode: enteredOtp,
      });
      console.log('[DEBUG-LOGIN] confirmVerificationCode result:', JSON.stringify(result, null, 2));
      console.log('[DEBUG-LOGIN] result.user:', result.user);
      console.log('[DEBUG-LOGIN] uid:', result.user?.uid, 'phone:', result.user?.phoneNumber);
      await completeLogin({
        uid: result.user?.uid,
        phoneNumber: result.user?.phoneNumber,
        getToken: async () => {
          const tokenResult = await nativeFirebaseAuth.getIdToken({ forceRefresh: true });
          console.log('[DEBUG-LOGIN] getIdToken result keys:', Object.keys(tokenResult || {}));
          return tokenResult.token;
        },
      });
    } catch (err) {
      console.error('[DEBUG-LOGIN] OTP verification FAILED:', err);
      console.error('[DEBUG-LOGIN] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
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

  changeNumberBtn.addEventListener('click', () => {
    otpStep.classList.add('hidden');
    phoneStep.classList.remove('hidden');
    confirmationResult = null;
    nativeVerificationId = '';
    showStatus('');
    phoneInput.focus();
  });
}

init().catch((error) => {
  const statusText = document.getElementById('statusText');
  if (statusText) statusText.textContent = error.message;
});