# happyga

Dating app MVP with a Capacitor Android wrapper, local demo login, in-memory wallet tracking, and modular frontend sections.

## Run locally

1. Install dependencies:
   npm install
2. Create the local env file:
   copy .env.example .env
3. Start the server:
   npm run dev
4. Open the app:
   http://localhost:3000

## Current app structure

The UI is split so the main surfaces are easier to edit:

1. `public/fragments/` contains page sections such as the home feed, profile page, sessions page, bottom navigation, and modals.
2. `public/scripts/pages/` contains page-specific logic.
3. `public/scripts/components/` contains reusable UI behavior such as bottom navigation and the coin modal.
4. `public/scripts/services/` contains auth and API helpers.

## Server API

The backend is now local-only and exposes these routes:

1. `GET /health`
2. `GET /api/wallet`
3. `POST /api/wallet/recharge`
4. `POST /api/calls/preflight`
5. `GET /api/sessions`
6. `POST /api/sessions`

Wallet and session data are stored in memory for the current server run.

## Environment variables

1. `HAPPYGA_DEFAULT_COINS`
2. `HAPPYGA_CALL_COST_COINS`
3. `HAPPYGA_LISTENER_PAYOUT_RATE`

## OTP troubleshooting

The login screen uses Firebase Phone Authentication.

### Web localhost

If OTP fails in the browser on `http://localhost:3000` or your LAN URL:

1. In Firebase Console -> Authentication -> Sign-in method, enable the `Phone` provider.
2. In Firebase Console -> Authentication -> Settings -> Authorized domains, add:
   - `localhost`
   - `127.0.0.1`
   - your current LAN host if you are opening the app from another device, for example `192.168.0.5`
3. Retry the flow from `login.html`.

Common browser-side Firebase errors:

1. `auth/unauthorized-domain`: add the current host to Authorized domains.
2. `auth/operation-not-allowed`: enable the Phone provider.
3. `auth/quota-exceeded`: Firebase SMS quota is exhausted.
4. `auth/captcha-check-failed`: reCAPTCHA failed, usually due to a stale page or blocked browser challenge.

### Android app / APK

If OTP fails in the Capacitor Android app:

1. Add the app package `com.teknlgy.happyga` in Firebase.
2. Register the app's SHA-1 and SHA-256 fingerprints in Firebase Project Settings.
3. Download the updated `google-services.json` from Firebase and place it at `android/app/google-services.json`.
4. Run `npm run cap:sync` after changing web auth code or Capacitor config.
5. Rebuild the app.

Common Android-side Firebase errors:

1. `auth/invalid-app-credential`: missing or incorrect SHA-1/SHA-256 fingerprints.
2. `auth/too-many-requests`: device or number is temporarily rate-limited.
3. `auth/code-expired`: a newer OTP was issued or the code expired.

### Notes

1. The local web app and the Android app use different verification paths: web uses Firebase reCAPTCHA, Android uses the Capacitor Firebase Authentication plugin.
2. After editing files under `public/`, run `npm run cap:sync` before testing the Android app so the latest web assets are copied into the native project.

## Android

The Android wrapper now only keeps the base Capacitor setup. After web changes, sync with:

1. `npm run cap:sync`
2. `npm run android:open`
3. `npm run apk:debug`
