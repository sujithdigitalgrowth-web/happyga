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
│   │   └── calls.js             # POST /api/calls/preflight
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
│       │   ├── profile-page.js  # Listener 3-step registration flow
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
- 10 hardcoded listener profiles (Indian female names, unique bios)
- Each profile card shows: avatar image, name, age, username, bio, online/offline status
- Online profiles: green dot + green "Online" badge + green call button icon
- Offline profiles: gray indicator + default brown call icon
- Sorted: online users first, then alphabetical
- Each profile uses a unique local avatar image from `public/profile-assets/`
- Clicking the call button triggers the call flow

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
- Call preflight checks coin balance (minimum 6 coins per call)
- Deducts coins before connecting
- Calls routed through separate Twilio call server (`dating-calls/` on port 3001)
- 35% random "busy" simulation for demo
- Call screen modal with status updates, end call button
- Test phone dial: enter a real number and ring it via Twilio
- If insufficient coins, "Buy Now" button redirects to wallet modal

### 5. Listener Registration (3-Step Flow)
- **Step 1 — Profile Details:**
  - Name, Language (Telugu/Hindi dropdown), About description
  - Shows earning model: 1 coin = 10 sec, 6 coins/min, 40% listener payout
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

### 7. Profile Page
- View/edit personal details (name, age, interests) via details modal
- Become a Listener button opens the 3-step registration modal
- Referral modal with code "HAPPYGA40" and copy button

### 8. Bottom Navigation
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
| POST | `/api/calls/preflight` | Check balance, deduct coins, initiate Twilio call |
| GET | `/api/sessions` | Get call history (last 50) |
| POST | `/api/sessions` | Save a call session |

All API routes require Firebase auth token in `Authorization` header.

Wallet response shape:
```json
{
  "balance": 50,
  "currency": "coins",
  "storage": "firestore",
  "callCostCoins": 6,
  "listenerPayoutRate": 0.4
}
```

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HAPPYGA_DEFAULT_COINS` | 0 | Starting coins for new users |
| `HAPPYGA_CALL_COST_COINS` | 6 | Coins deducted per call |
| `HAPPYGA_LISTENER_PAYOUT_RATE` | 0.4 | Listener earning rate (40%) |
| `CALL_SERVER_URL` | — | URL of the Twilio call server |
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

- Profiles are hardcoded (10 static profiles in `profiles.js`), not from a database
- Wallet recharge has no real payment gateway — coins are added directly
- Call "busy" state is randomly simulated (35% chance)
- Listener registration data is not persisted to backend yet
- No real-time presence — online/offline status is static per profile
- Firestore may throw NOT_FOUND errors if collections don't exist yet (handled gracefully, server won't crash)
