# HAPPYGA — Dating / Voice Call App (MVP)

A coin-based voice-calling dating app where users browse listener profiles, buy coins, and make real voice calls via Twilio Voice SDK (app-to-app). Per-second billing (1 coin / 10 sec), listener earnings (40% payout), and withdrawal system. Built with vanilla HTML/CSS/JS frontend, Node.js/Express backend, Firebase (Auth + Firestore), Twilio Voice SDK, and Capacitor for Android.

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES6 modules)
- **Backend:** Node.js + Express (2 services)
- **Database:** Firebase Firestore (`happygadatabase`)
- **Auth:** Firebase Phone Authentication (OTP — web reCAPTCHA + native Capacitor plugin)
- **Calls:** Twilio Voice SDK (app-to-app via `Twilio.Device`) + PSTN fallback via dedicated call server
- **Mobile:** Capacitor Android wrapper (package: `com.teknlgy.happyga`)
- **Deployment:** Railway (project: `accurate-ambition`, 2 services)
- **Dev tools:** nodemon, dotenv, ngrok (for Twilio webhooks in local dev)
- **Git:** GitHub — `https://github.com/sujithdigitalgrowth-web/happyga.git` (branch: `main`)

---

## Architecture — 2-Service Deployment

| Service | Directory | Port | Purpose |
|---------|-----------|------|---------|
| Main Backend | `/` (root) | `process.env.PORT` (default 3000) | API server, Firestore, billing, static frontend, TwiML webhook, Voice SDK tokens |
| Twilio Call Server | `/dating-calls/` | `process.env.PORT` (default 3001) | PSTN call initiation, call routing (legacy) |

Both services have their own `package.json`, `Procfile`, and `railway.json`.

### Call Flow (App-to-App via Voice SDK)

```
1. Frontend calls POST /api/calls/app-preflight → creates activeCalls record
2. Frontend requests GET /api/voice/token → receives Twilio Access Token
3. Frontend creates Twilio.Device, calls device.connect({ To: listenerIdentity, ... })
4. Twilio hits TwiML webhook POST /twilio/voice/client → returns <Dial><Client> TwiML
5. Listener's Twilio.Device receives incoming call → answers
6. During/after call, Twilio sends status events to POST /api/calls/status (statusCallback)
7. Status callback finalizes billing: deducts caller coins, credits listener earnings, saves sessions
```

---

## Project Structure

```
├── server.js                    # Main Express server + TwiML webhook handler
├── package.json                 # Main backend dependencies + scripts
├── Procfile                     # Railway: web: node server.js
├── railway.json                 # Railway deploy config (healthcheck /health)
├── capacitor.config.json        # Capacitor config (webDir: public)
├── serviceAccountKey.json       # Firebase Admin service account (gitignored)
├── .env                         # Environment variables (gitignored)
├── src/
│   ├── config.js                # PORT, DEFAULT_STARTING_COINS, CALL_SERVER_URL
│   ├── firebase-admin.js        # Firebase Admin SDK init (exports db, auth, FieldValue)
│   ├── middleware/auth.js        # Firebase token verification middleware
│   ├── routes/
│   │   ├── voice.js             # GET /api/voice/token — Twilio Access Token generation
│   │   ├── wallet.js            # GET/POST /api/wallet
│   │   ├── sessions.js          # GET/POST /api/sessions
│   │   ├── calls.js             # Preflight, app-preflight, status callback, live status polling
│   │   ├── listener.js          # Listener profile, status, sessions endpoints
│   │   └── withdrawals.js       # Withdrawal create/history endpoints
│   └── store/
│       ├── wallet.js            # Firestore wallet read/write + billing response
│       └── sessions.js          # Firestore session read/write
├── public/                      # Static frontend served by Express
│   ├── index.html               # Main app shell (SPA)
│   ├── login.html               # Login page (OTP flow)
│   ├── admin.html               # Admin panel
│   ├── styles.css               # All app styles
│   ├── login.css                # Login page styles
│   ├── auth-guard.js            # Redirect unauthenticated users to login
│   ├── profile-assets/          # Local listener avatars
│   ├── assets/brand/            # Logo, branding
│   ├── assets/icons/            # SVG icons
│   ├── fragments/               # HTML partials loaded dynamically
│   │   ├── home-view.html       # Home feed container
│   │   ├── profile-view.html    # Profile + listener dashboard + withdrawal modals
│   │   ├── sessions-view.html   # Call history container
│   │   ├── bottom-nav.html      # Bottom tab navigation
│   │   ├── topbar.html          # Top bar (logo + coins button)
│   │   ├── modals.html          # Call screen, coins modal, profile details, listener reg
│   │   └── login-card.html      # OTP login card
│   └── scripts/
│       ├── main.js              # App init, call state machine, Voice SDK lifecycle, timer
│       ├── firebase.js          # Firebase client SDK config
│       ├── login-page.js        # OTP login flow
│       ├── components/
│       │   ├── bottom-nav.js    # Tab switching logic
│       │   ├── coins-modal.js   # Wallet/purchase modal logic
│       │   └── random-call-button.js
│       ├── data/profiles.js     # Hardcoded example listener profiles (fallback)
│       ├── pages/
│       │   ├── home-page.js     # Profile card rendering + call triggers
│       │   ├── profile-page.js  # Listener dashboard, registration, withdrawals, chips
│       │   └── sessions-page.js # Call history rendering (new + legacy format)
│       ├── services/
│       │   ├── auth.js          # Auth state (localStorage), token refresh, headers
│       │   ├── api.js           # Fetch wrapper, all API helpers (native HTTP for Capacitor)
│       │   └── voice.js         # Twilio Voice SDK device management, call initiation
│       ├── shared/fragment-loader.js
│       └── utils/profile-images.js
├── dating-calls/                # Twilio Call Server (separate Railway service)
│   ├── server.js                # Express server for PSTN call routing
│   ├── package.json             # Own dependencies (twilio, express, cors)
│   ├── Procfile                 # web: node server.js
│   ├── railway.json             # Railway deploy config
│   └── src/
│       ├── services/twilio.service.js    # Twilio client, makeCall()
│       ├── controllers/calls.controller.js  # Call by number/username
│       ├── routes/
│       │   ├── calls.routes.js           # PSTN call route definitions
│       │   └── voice.routes.js           # TwiML webhook (production fallback)
│       └── data/users.js                 # Fallback phone lookup
└── android/                     # Capacitor Android project
    ├── app/
    │   ├── build.gradle
    │   ├── google-services.json # Firebase config (must include SHA fingerprints)
    │   └── src/main/            # Android sources
    └── app/build/outputs/apk/debug/app-debug.apk
```

---

## Features

### 1. Authentication (2-Step Login Flow)
- Firebase Phone Auth with OTP — **2-screen login UX:**
  - **Step 1 (Phone Screen):** User enters 10-digit phone number → taps "Send OTP"
  - **Step 2 (OTP Screen):** Phone screen hides, OTP input + "Verify & Continue" + "Resend OTP" + "← Change Number" button appears
- 3 login paths:
  - **Localhost demo mode:** Bypasses phone verification for local development
  - **Production web:** Firebase `RecaptchaVerifier` (invisible) + `signInWithPhoneNumber` + OTP confirmation
  - **Native Android (Capacitor):** `@capacitor-firebase/authentication@8.1.0` plugin — uses native Firebase Auth SDK for phone verification
- Native OTP has 20-second timeout indicator — shows error message if no response
- Auth state persisted in localStorage (`happyga_auth`)
- Auto token refresh via `onIdTokenChanged`
- Auth guard redirects unauthenticated users to login page
- Auth headers: `Authorization` (Bearer token), `x-happyga-phone`, `x-happyga-auth-mode`
- **Important:** Production web domain must be added to Firebase Console → Authentication → Authorized Domains
- **Important:** Android debug/release SHA-1 and SHA-256 fingerprints must be registered in Firebase Console → Project Settings → Android App

### 2. Home Page — Listener Feed
- Fetches approved listener profiles from Firestore via `GET /api/listeners`
- API listeners shown first, followed by hardcoded example profiles as fallback
- Profile cards: avatar, name (+age), bio, online/offline status
- Online: green dot + badge + green call button; Offline: gray + disabled button
- Sorted: online first, then alphabetical
- Clicking call saves `selectedListenerId`/`selectedListenerName` to localStorage

### 3. Coins / Wallet System
- Top bar shows coins pill with icon + balance
- "Recharge now" hint when balance is 0
- Dark-themed wallet modal with 9 coin packs (3×3 grid)
- Packs: 50 (₹41) → 5500 (₹2051) with "MD" and "Super Saver" tiers
- Buy → coins added to Firestore wallet → balance updates everywhere
- New users start with `HAPPYGA_DEFAULT_COINS` (default: 50)

### 4. Voice Calling — Twilio Voice SDK (App-to-App)
- **Two call transports:**
  - **Voice SDK (primary):** App-to-app via `Twilio.Device` — browser/WebView JS SDK, no phone numbers needed
  - **PSTN (fallback):** Via dating-calls service — dials actual phone numbers through Twilio
- **Voice SDK flow:**
  1. Frontend calls `POST /api/calls/app-preflight` → verifies balance, creates `activeCalls` record, marks listener busy
  2. Frontend requests `GET /api/voice/token` → backend generates Twilio Access Token (JWT) with VoiceGrant
  3. Frontend creates `Twilio.Device` with the token, calls `device.connect()` with target identity
  4. Twilio hits TwiML webhook `POST /twilio/voice/client` → returns `<Dial><Client>` TwiML with statusCallback
  5. Listener's `Twilio.Device` receives incoming call → displayed with caller's **profile name** (not phone number)
  6. Twilio sends status events (`initiated`, `ringing`, `answered`, `completed`) to `POST /api/calls/status`
  7. Status callback finalizes: deducts caller coins, credits listener, saves session records
- **Billing model:** 1 coin per 10 seconds of actual talk time
- **No upfront deduction** — coins charged post-call via Twilio status callback
- **Minimum 1 coin** to start a call
- **Balance enforcement:** `maxAllowedDurationSeconds = balance × 10`, passed as Twilio `timeLimit` for server-side auto-hangup
- **Unanswered calls** (busy/no-answer/failed/canceled) = 0 coins charged
- **Idempotent callbacks:** `finalized` flag prevents duplicate processing
- **Caller identity:** Shows registered display name on incoming calls (fetched from listener profile at startup)
- **Examples:** 5s = 1 coin, 30s = 3 coins, 60s = 6 coins

### 5. TwiML Webhook (`/twilio/voice/client`)
- Handles incoming Voice SDK connections from Twilio
- Generates `<Dial><Client>` TwiML with the target listener identity
- Passes custom parameters: `callerName`, `callerUid`, `listenerUid`, `listenerName`
- Includes `statusCallback` URL pointing to `STATUS_CALLBACK_BASE_URL/api/calls/status`
- Status callback events: `initiated ringing answered completed`
- Input sanitization: identity limited to alphanumeric + underscore, max 121 chars

### 6. Real-Time Call Status UI
- **Call state machine:** `idle → calling → ringing → connected → ended → failed`
- **Live polling:** Frontend polls `GET /api/calls/status/:callSid` every 2 seconds
- **Twilio REST API fallback:** Status endpoint queries Twilio directly when Firestore hasn't been finalized
- **Live timer:** 00:00 counter during connected calls
- **Call summary:** Shows duration + coins charged on call end
- **Low balance detection:** Shows warning if call ended due to insufficient coins
- **Duplicate call prevention:** Guards against multiple simultaneous call attempts
- **Disconnect propagation:** When either party disconnects, Twilio ends the call for both sides

### 7. Listener Earnings & Sessions
- **Listener payout:** 40% of charged coins credited to listener profile
- **Atomic updates:** `FieldValue.increment()` for listener `totalCoinsEarned` and `availableCoins`
- **Caller sessions:** Saved to `/users/{callerUid}/sessions` with full call metadata
- **Listener sessions:** Saved to `/listenerProfiles/{listenerId}/sessions` with earned coins
- **Session history page:** Renders call status (colored), duration, coins, timestamps
- **Legacy session support:** Detects and renders old-format sessions gracefully
- **Both transports supported:** Sessions saved for both Voice SDK and PSTN calls

### 8. Listener Registration (Simple Pending Approval)
- **Single-step form:** Display Name + Phone Number
- Submits to `POST /api/listener-profile` → creates doc with `status: "pending"`
- **In-app toast notification** confirms submission (no browser `alert()`)
- **Pending view:** If application is already submitted, shows "Application Under Review" card instead of re-showing the form
- **Admin approval:** Status changed to `"Approved"` in Firebase Console
- Once approved, the "Join as Listener" button auto-opens the Listener Dashboard

### 9. Listener Dashboard
- **Stat cards:** "Total Earned" (orange gradient) and "Available to Withdraw" (green gradient) coin counts
- **Online/offline badge:** Green dot + "ONLINE" or gray "OFFLINE" in header
- **Actions:** 3-column grid — Listener Mode, Withdraw, History
- **Recent Calls:** Scrollable list showing duration, earned coins, timestamp per call
- **Listener Mode:** Toggle Go Online / Go Offline, persisted to Firestore
- **Busy flag:** Automatically set when listener is in a call, cleared on call end
- **Dashboard auto-opens** when user clicks "Join as Listener" button and their status is already approved

### 10. Profile Page
- View/edit personal details (name, age)
- **Interest chips:** 10 selectable chip buttons (max 3), replacing the old textarea
  - Options: Casual Chat, Emotional Support, Relationship Advice, Flirting & Fun, Deep Conversations, Vent / Rant, Daily Life Talks, Motivation & Goals, Movies / Music, Timepass / Chill
  - Stored as array, displayed joined with " • " in profile summary
- **Listener status label** on the profile button dynamically shows:
  - "Join as a listener" (no profile)
  - "Application Under Review" (pending)
  - "Listener Dashboard" (approved)
- Approved listeners see the Listener Dashboard
- Non-listeners see the registration form

### 11. Withdrawals
- Two-step modal flow: enter amount (min ₹1000) → enter UPI ID → submit
- Validates: minimum amount, sufficient coins, non-empty UPI ID
- Deducts coins on successful submission
- **Withdrawal History modal:** Opens immediately with "Loading..." placeholder, loads data async
- Shows amount, status badge (pending/approved/rejected), timestamps
- **Modal positioning:** Withdraw and History modals use `dashboard-modal` class (z-index: 200) positioned outside the dashboard overlay to avoid `backdrop-filter` stacking context issues

### 12. Admin & Security
- **Admin endpoint** (`GET /api/withdrawals/admin`): Protected by `ADMIN_UIDS` env var allowlist
- All authenticated endpoints use `resolveUserIdentity()` — supports both Bearer tokens and `x-happyga-phone` header
- Firebase Admin SDK: Prefers `FIREBASE_SERVICE_ACCOUNT` env var (JSON string), falls back to local `serviceAccountKey.json` file
- `.gitignore` excludes secrets: `.env`, `.env.local`, `.env.production`, `serviceAccountKey.json`
- CORS configured for Capacitor Android (`capacitor://localhost`, custom schemes)
- Input sanitization on TwiML webhook (identity, caller name, UIDs)

### 13. Bottom Navigation
- 4 tabs: Home, Profile, Sessions, Random Call
- Active tab styling with fragment-based page switching

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| **Voice SDK** | | |
| GET | `/api/voice/token` | Generate Twilio Access Token (JWT) with VoiceGrant for `Twilio.Device` |
| POST | `/twilio/voice/client` | TwiML webhook — returns `<Dial><Client>` XML for Voice SDK connections |
| **Calls** | | |
| POST | `/api/calls/app-preflight` | Verify balance, create activeCalls record for Voice SDK call |
| POST | `/api/calls/preflight` | Verify balance, initiate PSTN call via dating-calls server |
| POST | `/api/calls/status` | Twilio statusCallback — charge coins, save sessions, credit listener |
| GET | `/api/calls/status/:callSid` | Live call status (Firestore + Twilio REST API fallback) |
| POST | `/api/calls/end/:callSid` | End active Twilio call, clear listener busy flag |
| **Wallet** | | |
| GET | `/api/wallet` | Get coin balance + billing info |
| POST | `/api/wallet/recharge` | Add coins (`{ coins, price }`) |
| **Sessions** | | |
| GET | `/api/sessions` | Get caller's call history (last 50) |
| POST | `/api/sessions` | Save a call session |
| **Listeners** | | |
| POST | `/api/listener-profile` | Create listener profile |
| GET | `/api/listener-profile` | Get current user's listener profile |
| POST | `/api/listener-status` | Update listener online/offline status |
| GET | `/api/listeners` | Get all approved listener profiles |
| GET | `/api/listener-sessions` | Get listener's recent calls (last 20) |
| **Withdrawals** | | |
| POST | `/api/withdrawals` | Create withdrawal request |
| GET | `/api/withdrawals` | Get withdrawal history |
| GET | `/api/withdrawals/admin` | Get all pending withdrawals (admin) |

### Firestore Collections

| Collection | Purpose |
|------------|---------|
| `users/{uid}` | Wallet balance |
| `users/{uid}/sessions` | Caller's call history |
| `listenerProfiles/{uid}` | Listener data, earnings, online status, busy flag |
| `listenerProfiles/{uid}/sessions` | Listener's call history (earned coins) |
| `activeCalls/{callSid}` | Live call tracking + billing metadata (PSTN calls) |
| `activeCalls/{tempCallId}` | Live call tracking for Voice SDK calls (keyed by `app_{callerUid}_{timestamp}`) |
| `withdrawalRequests/{id}` | Withdrawal requests |

### Wallet Response Shape
```json
{
  "balance": 50,
  "currency": "coins",
  "storage": "firestore",
  "billing": {
    "model": "duration-based",
    "minimumCoinsToStart": 1,
    "coinPerSeconds": 10
  }
}
```

---

## Environment Variables

### Main Backend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HAPPYGA_DEFAULT_COINS` | 50 | Starting coins for new users (uses `??` so `0` is valid) |
| `CALL_SERVER_URL` | `http://localhost:3001` | URL of the PSTN call server (dating-calls) |
| `STATUS_CALLBACK_BASE_URL` | `http://localhost:PORT` | Base URL for Twilio statusCallback — Twilio sends call events here |
| `TWILIO_ACCOUNT_SID` | — | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | — | Twilio phone number for PSTN calls |
| `TWILIO_API_KEY` | — | Twilio API Key SID (for Voice SDK Access Tokens) |
| `TWILIO_API_SECRET` | — | Twilio API Key Secret (for Voice SDK Access Tokens) |
| `TWIML_APP_SID` | — | Twilio TwiML Application SID (routes Voice SDK connections) |
| `FIREBASE_SERVICE_ACCOUNT` | — | Firebase service account JSON string (for Railway / production) |
| `ADMIN_UIDS` | — | Comma-separated Firebase UIDs for admin access |

### Twilio Call Server (`dating-calls/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `TWILIO_ACCOUNT_SID` | — | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | — | Twilio credentials |
| `TWILIO_PHONE_NUMBER` | — | Twilio outbound number |
| `STATUS_CALLBACK_BASE_URL` | — | Base URL for Twilio status callbacks (production: main backend Railway URL) |

---

## Twilio Setup

### 1. Create API Key (for Voice SDK tokens)
```bash
# Via Twilio CLI or Console → Account → API Keys
# Creates a Standard API Key
# Save the SID (SK...) and Secret — secret shown only once
```

### 2. Create TwiML Application
```bash
# Twilio Console → Voice → TwiML Apps → Create
# Voice Request URL: https://<your-domain>/twilio/voice/client
# Method: POST
# Save the Application SID (AP...)
```

### 3. Configure Environment
```bash
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STATUS_CALLBACK_BASE_URL=https://<your-publicly-accessible-url>
```

### Important: STATUS_CALLBACK_BASE_URL
This URL **must be publicly accessible** by Twilio's servers. Without it:
- Calls will connect but **billing won't work** (no coin deduction)
- **Sessions won't be recorded**
- **Disconnect won't propagate** properly
- **Listener earnings won't be credited**

For local development, use **ngrok** to expose your local server:
```bash
ngrok http 3000
# Copy the https://xxx.ngrok-free.dev URL → set as STATUS_CALLBACK_BASE_URL
```

Also update the TwiML App's Voice Request URL to point to your ngrok URL:
```
https://xxx.ngrok-free.dev/twilio/voice/client
```

---

## Run Locally

```bash
# 1. Main backend
npm install
cp .env.example .env    # fill in all credentials (see env vars table above)
npm run dev              # starts nodemon on port 3000

# 2. Twilio call server (separate terminal — only needed for PSTN calls)
cd dating-calls
npm install
cp .env.example .env
npm start                # starts on port 3001

# 3. ngrok tunnel (separate terminal — required for Twilio webhooks)
ngrok http 3000
# Copy the HTTPS URL and set:
#   - STATUS_CALLBACK_BASE_URL in .env
#   - TwiML App Voice Request URL in Twilio Console
```

Open http://localhost:3000

---

## Railway Deployment

Railway project: **accurate-ambition** — 2 services from the same repo.

| Service | Root Directory | Start Command | Domain |
|---------|---------------|----------------|--------|
| Main Backend (`web`) | `/` (root) | `node server.js` | `web-production-a1c42b.up.railway.app` |
| Twilio Call Server (`dating-calls`) | `/dating-calls/` | `node server.js` | `dating-calls-production.up.railway.app` |

### Railway Environment Variables

**Main Backend service:**

| Variable | Value |
|----------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON string of service account key |
| `CALL_SERVER_URL` | `https://dating-calls-production.up.railway.app` |
| `STATUS_CALLBACK_BASE_URL` | `https://web-production-a1c42b.up.railway.app` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number |
| `TWILIO_API_KEY` | Twilio API Key SID |
| `TWILIO_API_SECRET` | Twilio API Key Secret |
| `TWIML_APP_SID` | Twilio TwiML App SID |
| `ADMIN_UIDS` | Comma-separated Firebase UIDs |

**Dating-calls service:**

| Variable | Value |
|----------|-------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number |
| `STATUS_CALLBACK_BASE_URL` | `https://web-production-a1c42b.up.railway.app` |

### Production TwiML App Configuration
In Twilio Console → Voice → TwiML Apps, set the Voice Request URL to:
```
https://web-production-a1c42b.up.railway.app/twilio/voice/client
```
(Or use the dating-calls Railway URL if routing through that service)

### Post-Deploy Checklist
1. Add `web-production-a1c42b.up.railway.app` to Firebase Console → Authentication → Authorized Domains
2. Set all env vars above in Railway dashboard for both services
3. Update TwiML App Voice Request URL to the Railway domain
4. Verify `GET /health` returns 200 on both services
5. Test OTP login on the web domain
6. Test wallet balance, listener feed, call preflight
7. Make a test call and verify: call connects, audio works, session recorded, coins deducted

---

## Android Build

```bash
npm run cap:sync         # sync web assets to Android
npm run apk:debug        # build debug APK (requires JAVA_HOME)
```

Or manually:
```powershell
npx cap sync android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio2\jbr"
cd android
.\gradlew.bat installDebug    # builds + installs on connected device via ADB
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`
Package: `com.teknlgy.happyga`

### Wireless ADB Debugging (for installing on physical device)
```powershell
# Enable Wireless Debugging on phone → Settings → Developer Options
# Note the IP and pairing port shown on phone

$adb = "C:\Users\91703\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb pair <ip>:<pairing-port>      # enter pairing code from phone
& $adb connect <ip>:<debug-port>
& $adb devices                        # verify device shows as connected

# Then install:
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio2\jbr"
cd android
.\gradlew.bat installDebug
```

### Firebase Setup for Android OTP
1. Go to Firebase Console → Project Settings → Android app (`com.teknlgy.happyga`)
2. Add **SHA-1** and **SHA-256** fingerprints from your debug keystore:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
   ```
3. Download updated `google-services.json` and place in `android/app/`
4. For release builds, also add fingerprints from the release keystore (`happyga-upload.jks`)

### Native API Configuration
The Android APK connects to the backend via `NATIVE_API_BASE_URLS` in `public/scripts/services/api.js`. For local dev over WiFi, this should be your PC's local IP (e.g., `http://192.168.0.4:3000`). For production APK releases, update to the Railway URL.

---

## Known Limitations (MVP)

- **Wallet recharge has no payment gateway** — `POST /api/wallet/recharge` adds coins directly without payment verification (needs rate limiting / payment gateway before public launch)
- Listener online/offline is manual toggle (no auto idle detection)
- No realtime sockets for live presence updates across clients
- Call billing relies on Twilio status callbacks + REST API fallback polling
- Firestore may need composite indexes for ordered queries (withdrawals, listener sessions)
- `NATIVE_API_BASE_URLS` in `api.js` has hardcoded IPs — update to actual domain before Android APK release
- STATUS_CALLBACK_BASE_URL must be publicly accessible — ngrok required for local dev, Railway URL for production
- TwiML App Voice Request URL must match wherever the `/twilio/voice/client` route is hosted
- `.phone-shell.card` uses `backdrop-filter: blur(8px)` which creates a containing block — `position: fixed` elements inside behave as `position: absolute` relative to the shell. Overlays use CSS variables (`--app-overlay-top/right/bottom/left`) computed relative to shell bounds in `main.js`

---

## Development Workflow Summary

1. **Start backend:** `npm run dev` (port 3000)
2. **Start ngrok:** `ngrok http 3000` → copy HTTPS URL
3. **Set env vars:** `STATUS_CALLBACK_BASE_URL=<ngrok-url>` in `.env`
4. **Update TwiML App:** Set Voice Request URL to `<ngrok-url>/twilio/voice/client` in Twilio Console
5. **Restart server** after `.env` changes
6. **Open localhost:3000** in browser for web testing
7. **For Android:** Connect phone via ADB → `gradlew.bat installDebug`
8. **Test call:** Make a call → verify audio, disconnect, sessions, and coin billing all work
