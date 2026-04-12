const { Router } = require('express');
const twilio = require('twilio');
const { resolveUserIdentity } = require('../middleware/auth');

const router = Router();

router.get('/token', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWIML_APP_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET || !TWIML_APP_SID) {
    return res.status(500).json({ error: 'Twilio voice credentials not configured' });
  }

  // Twilio identity must contain only alphanumeric chars and underscores (max 121)
  const identity = user.uid.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 121);

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity,
    ttl: 3600,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWIML_APP_SID,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity });
});

module.exports = router;
