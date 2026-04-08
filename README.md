# HAPPYGA — Dating / Voice Call App (MVP)

A coin-based voice-calling dating app where users browse listener profiles, buy coins, and make real voice calls via Twilio. Per-second billing (1 coin / 10 sec), listener earnings (40% payout), and withdrawal system. Built with vanilla HTML/CSS/JS frontend, Node.js/Express backend, Firebase (Auth + Firestore), and Capacitor for Android.

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES6 modules)
- **Backend:** Node.js + Express (2 services)
- **Database:** Firebase Firestore (`happygadatabase`)
- **Auth:** Firebase Phone Authentication (OTP-based)
- **Calls:** Twilio Voice API (dedicated call server)
- **Mobile:** Capacitor Android wrapper
- **Deployment:** Railway (2 services)
- **Dev tools:** nodemon, dotenv

---

## Architecture — 2-Service Deployment

| Service | Directory | Port | Purpose |
|---------|-----------|------|---------|
| Main Backend | `/` (root) | `process.env.PORT` (default 3000) | API server, Firestore, billing, static frontend |
| Twilio Call Server | `/dating-calls/` | `process.env.PORT` (default 3001) | Twilio call initiation, call routing |

Both services have their own `package.json`, `Procfile`, and `railway.json`.

---

## Project Structure

```
├── server.js                    # Main Express server
├── package.json                 # Main backend dependencies + scripts
├── Procfile                     # Railway: web: node server.js
├── railway.json                 # Railway deploy config (healthcheck /health)
├── capacitor.config.json        # Capacitor config (webDir: public)
├── serviceAccountKey.json       # Firebase Admin service account
├── src/
│   ├── config.js                # PORT, DEFAULT_STARTING_COINS, CALL_SERVER_URL
│   ├── firebase-admin.js        # Firebase Admin SDK init (exports db, auth, FieldValue)
│   ├── middleware/auth.js        # Firebase token verification middleware
│   ├── routes/
│   │   ├── wallet.js            # GET/POST /api/wallet
│   │   ├── sessions.js          # GET/POST /api/sessions
│   │   ├── calls.js             # Preflight, status callback, live status polling
│   │   ├── listener.js          # Listener profile, status, sessions endpoints
│   │   └── withdrawals.js       # Withdrawal create/history endpoints
│   └── store/
│       ├── wallet.js            # Firestore wallet read/write + billing response
│       └── sessions.js          # Firestore session read/write
├── public/                      # Static frontend served by Express
│   ├── index.html               # Main app shell (SPA)
│   ├── login.html               # Login page (OTP flow)
│   ├── styles.css               # All app styles
│   ├── login.css                # Login page styles
│   ├── auth-guard.js            # Redirect unauthenticated users to login
│   ├── profile-assets/          # 8 local listener avatars
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
│       ├── main.js              # App init, call state machine, polling, timer
│       ├── firebase.js          # Firebase client SDK config
│       ├── login-page.js        # OTP login flow
│       ├── components/
│       │   ├── bottom-nav.js    # Tab switching logic
│       │   ├── coins-modal.js   # Wallet/purchase modal logic
│       │   └── random-call-button.js
│       ├── data/profiles.js     # 10 hardcoded example listener profiles
│       ├── pages/
│       │   ├── home-page.js     # Profile card rendering + call triggers
│       │   ├── profile-page.js  # Listener dashboard, registration, withdrawals, chips
│       │   └── sessions-page.js # Call history rendering (new + legacy format)
│       ├── services/
│       │   ├── auth.js          # Auth state (localStorage), token refresh, headers
│       │   └── api.js           # Fetch wrapper, all API helpers
│       ├── shared/fragment-loader.js
│       └── utils/profile-images.js
├── dating-calls/                # Twilio Call Server (separate service)
│   ├── server.js                # Express server for call routing
│   ├── package.json             # Own dependencies (twilio, express, cors)
│   ├── Procfile                 # web: node server.js
│   ├── railway.json             # Railway deploy config
│   └── src/
│       ├── services/twilio.service.js    # Twilio client, makeCall()
│       ├── controllers/calls.controller.js  # Call by number/username
│       ├── routes/calls.routes.js        # Route definitions
│       └── data/users.js                 # Fallback phone lookup
└── android/                     # Capacitor Android project
    └── app/build/outputs/apk/debug/app-debug.apk
```

---

## Features

### 1. Authentication
- Firebase Phone Auth with OTP
- reCAPTCHA verification on web, native plugin on Android
- Auth state persisted in localStorage (`happyga_auth`)
- Auto token refresh via `onIdTokenChanged`
- Auth guard redirects unauthenticated users to login page
- Auth headers: `Authorization` (Bearer token), `x-happyga-phone`, `x-happyga-auth-mode`

### 2. Home Page — Listener Feed
- Fetches approved listener profiles from Firestore via `GET /api/listeners`
- API listeners shown first, followed by 10 hardcoded example profiles as fallback
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

### 4. Voice Calling (Twilio) — Per-Second Billing
- **Billing model:** 1 coin per 10 seconds of actual talk time
- **No upfront deduction** — coins charged post-call via Twilio status callback
- **Minimum 1 coin** to start a call
- **Balance enforcement:** `maxAllowedDurationSeconds = balance × 10`, passed as Twilio `timeLimit` for server-side auto-hangup
- **Unanswered calls** (busy/no-answer/failed/canceled) = 0 coins charged
- **Idempotent callbacks:** `finalized` flag prevents duplicate processing
- **Examples:** 5s = 1 coin, 30s = 3 coins, 60s = 6 coins

### 5. Real-Time Call Status UI
- **Call state machine:** `idle → calling → ringing → connected → ended → failed`
- **Live polling:** Frontend polls `GET /api/calls/status/:callSid` every 2 seconds
- **Twilio REST API fallback:** Status endpoint queries Twilio directly when Firestore hasn't been finalized (handles unreachable callback URLs)
- **Live timer:** 00:00 counter during connected calls
- **Call summary:** Shows duration + coins charged on call end
- **Low balance detection:** Shows warning if call ended due to insufficient coins
- **Duplicate call prevention:** Guards against multiple simultaneous call attempts

### 6. Listener Earnings & Sessions
- **Listener payout:** 40% of charged coins credited to listener profile
- **Atomic updates:** `FieldValue.increment()` for listener `totalCoinsEarned` and `availableCoins`
- **Caller sessions:** Saved to `/users/{callerUid}/sessions` with full call metadata
- **Listener sessions:** Saved to `/listenerProfiles/{listenerId}/sessions` with earned coins
- **Session history page:** Renders call status (colored), duration, coins, timestamps
- **Legacy session support:** Detects and renders old-format sessions gracefully

### 7. Listener Registration (3-Step Flow)
- **Step 1:** Name, Language (Telugu/Hindi), About description
- **Step 2:** Voice verification (Web Speech Recognition) + Gender selection
  - Female → auto-approved; Male → under review
- **Step 3:** Avatar selection (8 images)
- Creates `listenerProfiles` doc in Firestore

### 8. Listener Dashboard
- **Stat cards:** "Earned" (orange gradient) and "Available" (green gradient) coin counts
- **Online/offline badge:** Green dot + "ONLINE" or gray "OFFLINE" in header
- **Actions:** 3-column grid — Listener Mode, Withdraw, History
- **Recent Calls:** Scrollable list showing duration, earned coins, timestamp per call
- **Listener Mode:** Toggle Go Online / Go Offline, persisted to Firestore

### 9. Profile Page
- View/edit personal details (name, age)
- **Interest chips:** 10 selectable chip buttons (max 3), replacing the old textarea
  - Options: Casual Chat, Emotional Support, Relationship Advice, Flirting & Fun, Deep Conversations, Vent / Rant, Daily Life Talks, Motivation & Goals, Movies / Music, Timepass / Chill
  - Stored as array, displayed joined with " • " in profile summary
- Approved listeners see the Listener Dashboard
- Non-listeners see "Join as a listener" button

### 10. Withdrawals
- Two-step modal flow: enter amount (min ₹1000) → enter UPI ID → submit
- Validates: minimum amount, sufficient coins, non-empty UPI ID
- Deducts coins on successful submission
- **Withdrawal History modal:** Opens immediately with "Loading..." placeholder, loads data async
- Shows amount, status badge (pending/approved/rejected), timestamps

### 11. Bottom Navigation
- 4 tabs: Home, Profile, Sessions, Random Call
- Active tab styling with fragment-based page switching

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/wallet` | Get coin balance + billing info |
| POST | `/api/wallet/recharge` | Add coins (`{ coins, price }`) |
| POST | `/api/calls/preflight` | Verify balance, initiate Twilio call, save metadata |
| POST | `/api/calls/status` | Twilio status callback — charge coins, save sessions, credit listener |
| GET | `/api/calls/status/:callSid` | Live call status (Firestore + Twilio fallback) |
| GET | `/api/sessions` | Get caller's call history (last 50) |
| POST | `/api/sessions` | Save a call session |
| POST | `/api/listener-profile` | Create listener profile |
| GET | `/api/listener-profile` | Get current user's listener profile |
| POST | `/api/listener-status` | Update listener online/offline status |
| GET | `/api/listeners` | Get all approved listener profiles |
| GET | `/api/listener-sessions` | Get listener's recent calls (last 20) |
| POST | `/api/withdrawals` | Create withdrawal request |
| GET | `/api/withdrawals` | Get withdrawal history |
| GET | `/api/withdrawals/admin` | Get all pending withdrawals (admin) |

### Firestore Collections

| Collection | Purpose |
|------------|---------|
| `users/{uid}` | Wallet balance |
| `users/{uid}/sessions` | Caller's call history |
| `listenerProfiles/{uid}` | Listener data, earnings, online status |
| `listenerProfiles/{uid}/sessions` | Listener's call history (earned coins) |
| `activeCalls/{callSid}` | Live call tracking + billing metadata |
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
| `HAPPYGA_DEFAULT_COINS` | 0 | Starting coins for new users |
| `CALL_SERVER_URL` | `http://localhost:3001` | URL of the Twilio call server |
| `STATUS_CALLBACK_BASE_URL` | `http://localhost:PORT` | Base URL for Twilio status callbacks |
| `TWILIO_ACCOUNT_SID` | — | Twilio credentials (for live status polling) |
| `TWILIO_AUTH_TOKEN` | — | Twilio credentials |

### Twilio Call Server (`dating-calls/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `TWILIO_ACCOUNT_SID` | — | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | — | Twilio credentials |
| `TWILIO_PHONE_NUMBER` | — | Twilio outbound number |
| `TWILIO_VOICE_XML_URL` | Twilio demo | TwiML URL for call audio |

---

## Run Locally

```bash
# Main backend
npm install
cp .env.example .env    # fill in credentials
npm run dev              # starts nodemon on port 3000

# Twilio call server (separate terminal)
cd dating-calls
npm install
cp .env.example .env
npm start                # starts on port 3001
```

Open http://localhost:3000

---

## Railway Deployment

Both services deploy as separate Railway services from the same repo.

**Main Backend** — root directory, start: `node server.js`
**Call Server** — `dating-calls/` directory, start: `node server.js`

Railway env vars to set:

| Service | Variable | Value |
|---------|----------|-------|
| Main Backend | `CALL_SERVER_URL` | `https://<call-server>.up.railway.app` |
| Main Backend | `STATUS_CALLBACK_BASE_URL` | `https://<main-backend>.up.railway.app` |
| Main Backend | `TWILIO_ACCOUNT_SID` | Twilio creds |
| Main Backend | `TWILIO_AUTH_TOKEN` | Twilio creds |
| Call Server | `TWILIO_ACCOUNT_SID` | Twilio creds |
| Call Server | `TWILIO_AUTH_TOKEN` | Twilio creds |
| Call Server | `TWILIO_PHONE_NUMBER` | Twilio number |

---

## Android Build

```bash
npm run cap:sync         # sync web assets to Android
npm run apk:debug        # build debug APK (requires JAVA_HOME)
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`
Package: `com.teknlgy.happyga`
Requires SHA-1/SHA-256 fingerprints registered in Firebase for OTP.

---

## Known Limitations (MVP)

- Wallet recharge has no real payment gateway — coins are added directly
- Listener online/offline is manual toggle (no auto idle detection)
- No realtime sockets for live presence updates across clients
- Call billing relies on Twilio status callbacks + REST API fallback polling
- Firestore may need composite indexes for ordered queries (withdrawals, listener sessions)
