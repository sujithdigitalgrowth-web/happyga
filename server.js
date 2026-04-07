const path = require('path');
const express = require('express');
const cors = require('cors');

require('dotenv').config();

// Prevent unhandled Firestore/gRPC errors from crashing the server
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
});

const { PORT, CALL_SERVER_URL } = require('./src/config');
const walletRoutes  = require('./src/routes/wallet');
const sessionRoutes = require('./src/routes/sessions');
const callRoutes    = require('./src/routes/calls');

const app = express();

// Allow requests from Capacitor Android app and any HTTPS client
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Uid', 'X-Token'],
}));
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => res.json({ status: 'ok', storage: 'firestore', callMode: 'live' }));

app.use('/api/wallet',   walletRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/calls',    callRoutes);

// Raw-number proxy: POST /api/call { toNumber }  (used by test page & call screen dial)
app.post('/api/call', async (req, res) => {
  const toNumber = String(req.body?.toNumber || '').trim();
  if (!toNumber) return res.status(400).json({ success: false, error: 'toNumber is required' });
  try {
    const r = await fetch(`${CALL_SERVER_URL}/api/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ toNumber }),
    });
    return res.status(r.status).json(await r.json());
  } catch {
    return res.status(502).json({ success: false, error: 'Call server unreachable' });
  }
});

app.listen(PORT, () => console.log(`Main server  →  http://localhost:${PORT}`));
