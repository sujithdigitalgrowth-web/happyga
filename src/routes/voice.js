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

  // Optional: platform hint from client — 'android' | 'ios' | 'web'
  const platform = String(req.query.platform || req.headers['x-happyga-platform'] || '').toLowerCase();

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity,
    ttl: 3600,
  });

  const voiceGrantOptions = {
    outgoingApplicationSid: TWIML_APP_SID,
    incomingAllow: true,
  };

  // Include push credential SID for Android native push notifications.
  // This tells Twilio to send FCM pushes for incoming calls to this identity.
  // TWILIO_PUSH_CREDENTIAL_SID_ANDROID must be created in Twilio Console
  // (Credentials → Push → FCM) with the Firebase Server Key / Service Account JSON.
  if (platform === 'android' && process.env.TWILIO_PUSH_CREDENTIAL_SID_ANDROID) {
    voiceGrantOptions.pushCredentialSid = process.env.TWILIO_PUSH_CREDENTIAL_SID_ANDROID;
  }

  const voiceGrant = new VoiceGrant(voiceGrantOptions);
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity });
});

module.exports = router;
