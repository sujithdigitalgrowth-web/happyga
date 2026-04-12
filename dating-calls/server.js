require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const callsRouter = require('./src/routes/calls.routes');
const voiceRouter = require('./src/routes/voice.routes');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('/{*path}', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/call', callsRouter);
app.use('/twilio/voice/client', voiceRouter);

app.listen(PORT, () => {
  console.log(`Call server running on http://localhost:${PORT}`);
  // Verify Twilio credentials at startup
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;
  console.log('[startup] TWILIO_ACCOUNT_SID:', sid ? `set (${sid.slice(0, 6)}...${sid.slice(-4)})` : 'MISSING');
  console.log('[startup] TWILIO_AUTH_TOKEN:', token ? `set (***${token.slice(-4)})` : 'MISSING');
  console.log('[startup] TWILIO_PHONE_NUMBER:', phone ? `set (***${phone.slice(-4)})` : 'MISSING');
  console.log('[startup] TWILIO_VOICE_XML_URL:', process.env.TWILIO_VOICE_XML_URL || '(default: demo.twilio.com)');
  if (!sid || !token || !phone) {
    console.error('[startup] WARNING: Missing Twilio credentials — calls will fail!');
  }
});
