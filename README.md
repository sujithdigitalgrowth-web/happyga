# HAPPYGA — Dating / Voice Call App (MVP)

A coin-based voice-calling dating app where users browse listener profiles, buy coins, and make voice calls via Twilio. Built with vanilla HTML/CSS/JS frontend, Node.js/Express backend, Firebase (Auth + Firestore), and Capacitor for Android.

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES6 modules)
- **Backend:** Node.js + Express (port 3000)
- **Database:** Firebase Firestore (wallet, sessions stored per user)
- **Auth:** Firebase Phone Authentication (OTP-based)
- **Calls:** Twilio voice API (via separate call server)
- **Mobile:** Capacitor Android wrapper
- **Dev tools:** nodemon, dotenv

---

## Project Structure

```
├── server.js                    # Main Express server
├── src/
│   ├── config.js                # Environment config
│   ├── firebase-admin.js        # Firebase Admin SDK init
│   ├── middleware/auth.js        # Firebase token verification middleware
│   ├── routes/
│   │   ├── wallet.js            # GET/POST /api/wallet
│   │   ├── sessions.js          # GET/POST /api/sessions
│   │   ├── calls.js             # POST /api/calls/preflight
│   │   ├── listener.js          # Listener profile + online status endpoints
│   │   └── withdrawals.js       # Withdrawal create/history endpoints
│   └── store/
│       ├── wallet.js            # Firestore wallet read/write
│       └── sessions.js          # Firestore session read/write
├── public/                      # Static frontend served by Express
│   ├── index.html               # Main app shell (SPA)
│   ├── login.html               # Login page (OTP flow)
│   ├── styles.css               # All app styles
│   ├── login.css                # Login page styles
│   ├── auth-guard.js            # Redirect to login if not authenticated
│   ├── profile-assets/          # 8 local listener avatar images (listener-1.png to listener-8.png)
│   ├── assets/
│   │   ├── brand/               # Logo, branding
│   │   └── icons/               # SVG icons (coins, call buttons, nav icons)
│   ├── fragments/               # HTML partials loaded dynamically
│   │   ├── home-view.html       # Home feed container
│   │   ├── profile-view.html    # Profile/listener registration container
│   │   ├── sessions-view.html   # Call history container
│   │   ├── bottom-nav.html      # Bottom tab navigation
│   │   ├── topbar.html          # Top bar (logo + coins button)
│   │   ├── modals.html          # All modal dialogs
│   │   └── login-card.html      # OTP login card
│   └── scripts/
│       ├── main.js              # App init, wallet, call logic, page wiring
│       ├── firebase.js          # Firebase client SDK config
│       ├── login-page.js        # OTP login flow
│       ├── components/
│       │   ├── bottom-nav.js    # Tab switching logic
│       │   ├── coins-modal.js   # Wallet/purchase modal logic
│       │   └── random-call-button.js  # Random call feature
│       ├── data/
│       │   └── profiles.js      # 10 hardcoded listener profiles (MVP)
│       ├── pages/
│       │   ├── home-page.js     # Profile card rendering + call triggers
│       │   ├── profile-page.js  # Listener registration, dashboard, listener mode, withdrawals
│       │   └── sessions-page.js # Call history rendering
│       ├── services/
│       │   ├── auth.js          # Auth state (localStorage), token refresh
│       │   └── api.js           # Fetch wrapper with auth headers
│       ├── shared/
│       │   └── fragment-loader.js  # Dynamic HTML fragment loading
│       └── utils/
│           └── profile-images.js   # Avatar URL helper
├── dating-calls/                # Separate Twilio call server (port 3001)
│   ├── server.js
│   ├── src/services/twilio.service.js
│   ├── src/controllers/calls.controller.js
│   └── src/routes/calls.routes.js
├── android/                     # Capacitor Android project
├── capacitor.config.json
├── serviceAccountKey.json       # Firebase Admin service account
└── package.json
```

---

## Features Built (MVP)

### 1. Authentication
- Firebase Phone Auth with OTP
- reCAPTCHA verification on web, native plugin on Android
- Auth state persisted in localStorage (`happyga_auth`)
- Auto token refresh via `onIdTokenChanged`
- Auth guard redirects unauthenticated users to login page
- Auth headers sent with every API call: `Authorization` (Bearer token), `x-happyga-phone`, `x-happyga-auth-mode`

### 2. Home Page — Listener Feed
- **Live listeners from Firestore:** Fetches approved listener profiles from `GET /api/listeners` on page load
- **Merged feed:** API listeners displayed first, followed by 10 hardcoded example profiles (Indian female names) as fallback/padding
- Each profile card shows: avatar image, name (+ age if available), bio, online/offline status
- Online profiles: green dot + green "Online" badge + green call button icon
- Offline profiles: gray indicator + default brown call icon + **disabled call button**
- Sorted: online users first, then alphabetical
- Each profile uses a unique local avatar image from `public/profile-assets/`
- Firestore field normalization: handles `displayName`, `name`, `avatar`, `bio`, `age`, `isOnline`, `uid`
- Clicking the call button saves `selectedListenerId` and `selectedListenerName` to localStorage, then triggers the call flow
- Call preflight request sends `listenerId` and `listenerName` alongside `to` in the request body
- Graceful fallback: if API fails, only hardcoded example profiles are shown

### 3. Coins / Wallet System
- Top bar shows a pill-shaped coins button with icon + current balance
- When balance is 0, a small "Recharge now" hint appears below the button
- Clicking opens a dark-themed wallet modal with 9 coin packs in a 3×3 grid:
  - 50 (₹41), 100 (₹82), 250 (₹121)
  - 550 (₹251), 850 (₹351), 1350 (₹551) — marked "MD"
  - 2650 (₹1051), 4000 (₹1551), 5500 (₹2051) — "Super Saver" premium tier
- User selects a pack → "Buy Now" → coins added to Firestore wallet
- Balance updates in real-time across all UI elements

### 4. Voice Calling (Twilio)
- **Per-second billing:** 1 coin per 10 seconds of actual talk time (charged after call ends)
- Preflight checks minimum 1 coin balance to start a call
- No upfront deduction — coins charged post-call via Twilio status callback
- Unanswered calls (busy / no-answer / failed / canceled) = 0 coins
- Examples: 5 sec = 1 coin, 30 sec = 3 coins, 60 sec = 6 coins
- Calls routed through separate Twilio call server (`dating-calls/` on port 3001)
- Call metadata tracked in `activeCalls` Firestore collection
- Call screen modal with status updates, end call button
- Test phone dial: enter a real number and ring it via Twilio
- If insufficient coins, "Buy Now" button redirects to wallet modal

### 5. Listener Registration (3-Step Flow)
- **Step 1 — Profile Details:**
  - Name, Language (Telugu/Hindi dropdown), About description
  - Shows earning model: 1 coin per 10 sec of talk time, charged after call
- **Step 2 — Voice Verification + Gender:**
  - Records voice reading a fixed sentence using Web Speech Recognition API (en-IN)
  - User selects gender (Female/Male)
  - Female → auto-approved → proceeds to Step 3
  - Male → shown "under review" status
- **Step 3 — Avatar Selection:**
  - Grid of 8 avatar images to choose from
  - Confirm to complete registration

### 6. Sessions / Call History
- `GET /api/sessions` fetches last 50 calls (newest first)
- `POST /api/sessions` saves: listener name, username, duration, timestamp
- Stored in Firestore subcollection: `/users/{uid}/sessions`
- Sessions page renders call history with listener info and timestamps

### 7. Profile Page + Listener Dashboard
- View/edit personal details (name, age, interests) via details modal
- Become a Listener button opens the 3-step registration modal
- Approved listeners see a Listener Dashboard with:
  - Coins Earned and Available Coins
  - Withdraw action
  - Switch to Listener Mode action
- Refer a friend option was removed from the profile menu for a cleaner UX

### 8. Listener Mode (New)
- Added Listener Mode section in profile view (hidden by default)
- "Switch to Listener Mode" button reveals Listener Mode and hides normal account options
- Listener can toggle:
  - Go Online
  - Go Offline
- Online/offline UI state syncs from backend profile (`profile.isOnline`) on load
- Listener status updates are persisted to Firestore through backend endpoint

### 9. Withdrawals (Upgraded UX)
- Replaced browser `prompt()` flow with in-app popup modals
- Two-step withdrawal flow:
  - Step 1: enter amount (minimum Rs 1000)
  - Step 2: enter UPI ID and submit
- Validation rules:
  - Amount below Rs 1000 is blocked
  - Amount greater than available coins is blocked
  - Missing/empty UPI ID is blocked
- On successful submit:
  - Withdrawal request is saved to backend/database
  - Coins section refreshes from profile
  - Success note shown in dashboard
- Withdrawal History now opens in a popup modal and shows amount, status, and request time

### 10. Bottom Navigation
- 4 tabs: Home, Profile, Sessions, Random Call
- Active tab styling with page switching
- Fragment-based view loading

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/wallet` | Get coin balance |
| POST | `/api/wallet/recharge` | Add coins (body: `{ coins, price }`) |
| POST | `/api/calls/preflight` | Check balance (min 1 coin), initiate Twilio call |
| POST | `/api/calls/status` | Twilio status callback — charges coins post-call |
| GET | `/api/sessions` | Get call history (last 50) |
| POST | `/api/sessions` | Save a call session |
| POST | `/api/listener-profile` | Create listener profile |
| GET | `/api/listener-profile` | Get listener profile |
| POST | `/api/listener-status` | Update listener online/offline status |
| GET | `/api/listeners` | Get all approved listener profiles |
| POST | `/api/withdrawals` | Create withdrawal request |
| GET | `/api/withdrawals` | Get withdrawal history |

All API routes require Firebase auth token in `Authorization` header.

Wallet response shape:
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

## Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HAPPYGA_DEFAULT_COINS` | 0 | Starting coins for new users |
| `CALL_SERVER_URL` | — | URL of the Twilio call server |
| `STATUS_CALLBACK_BASE_URL` | `http://localhost:PORT` | Base URL for Twilio status callbacks |
| `TWILIO_ACCOUNT_SID` | — | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | — | Twilio credentials |
| `TWILIO_PHONE_NUMBER` | — | Twilio phone number |

---

## Run Locally

```bash
npm install
cp .env.example .env    # fill in credentials
npm run dev              # starts nodemon on port 3000
```

Open http://localhost:3000

---

## Android Build

```bash
npm run cap:sync         # sync web assets to Android
npm run android:open     # open in Android Studio
npm run apk:debug        # build debug APK
```

Package: `com.teknlgy.happyga`
Requires SHA-1/SHA-256 fingerprints registered in Firebase for OTP to work.

---

## Known Limitations (MVP)

- Wallet recharge has no real payment gateway — coins are added directly
- Call "busy" state is randomly simulated (35% chance)
- Listener online/offline is manual toggle (no auto idle detection yet)
- No realtime sockets for live presence updates across all clients yet
- Firestore may throw NOT_FOUND errors if collections don't exist yet (handled gracefully, server won't crash)
- Call billing relies on Twilio status callbacks — if callback fails, call is not charged

---

## Latest Changes Log (April 2026)

- Added Listener Dashboard switch button: "Switch to Listener Mode"
- Added Listener Mode section with Online/Offline status and Go Online/Go Offline controls
- Added backend endpoint: `POST /api/listener-status`
- Added frontend API helper: `updateListenerStatus(authState, isOnline)`
- Wired profile page online/offline buttons to backend status updates
- Synced Listener Mode status UI from backend profile state on page load
- Improved button and card styling for dashboard + listener mode using app theme colors
- Removed "Refer a friend" option from profile menu
- Replaced withdraw browser prompts with in-app modals and validations
- Added Withdrawal History popup modal (amount, status, timestamp)
- **Added `GET /api/listeners` backend endpoint** — fetches all approved listeners from Firestore `listenerProfiles` collection
- **Added `getListeners()` frontend API helper** in `api.js`
- **Home page now loads real listener profiles from Firestore** on page load, merged with hardcoded example profiles
- **Normalized Firestore field mapping** — handles `displayName`/`name`, `avatar`, `bio`, `age`, `uid`, `isOnline`
- **Standardized Firestore collection name** to `listenerProfiles` across all backend routes (listener.js, withdrawals.js)
- **Disabled call button for offline listeners** — button is grayed out and non-clickable
- **Removed @username line from profile cards** — cards now show only name/age and bio
- **Conditional age display** — shows "Name, Age" when age exists, just "Name" when missing
- **localStorage persistence of selected listener** — saves `selectedListenerId` and `selectedListenerName` on call button click
- **Call preflight sends listener data** — `listenerId` and `listenerName` included in `/api/calls/preflight` request body
- **Backend reads listener data in preflight** — `listenerId` and `listenerName` destructured from `req.body` in `POST /api/calls/preflight` with temporary console logs (no logic changes yet)
