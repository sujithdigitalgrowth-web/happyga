const { Router } = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const router = Router();

/**
 * POST /twilio/voice/client
 *
 * TwiML App webhook for outgoing Voice SDK calls.
 * Reads the "To" parameter sent by the Twilio Device and dials
 * that identity as a Twilio Client (app-to-app).
 *
 * statusCallback is pointed at the main backend so billing/session
 * finalization works identically to the PSTN path.
 */
router.post('/', (req, res) => {
  const to = String(req.body?.To || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 121);
  const twiml = new VoiceResponse();

  if (to) {
    console.log('[TwiML] Dialling client identity:', to);

    // Resolve status callback URL — prefer explicit env var, fall back to main backend
    const statusCallbackUrl = process.env.STATUS_CALLBACK_BASE_URL
      ? `${process.env.STATUS_CALLBACK_BASE_URL}/api/calls/status`
      : (process.env.MAIN_BACKEND_URL
        ? `${process.env.MAIN_BACKEND_URL}/api/calls/status`
        : null);

    const dialAttrs = { callerId: req.body?.From || 'client:anonymous' };
    if (statusCallbackUrl) {
      dialAttrs.action = statusCallbackUrl;
      // Note: statusCallback on <Dial> fires for the child (dialled) leg
    }

    const dial = twiml.dial(dialAttrs);
    const client = dial.client({
      statusCallback: statusCallbackUrl || undefined,
      statusCallbackEvent: 'initiated ringing answered completed',
    }, to);

    // Forward caller metadata as custom parameters to the receiving client
    const callerName = String(req.body?.callerName || '').slice(0, 100);
    const callerUid = String(req.body?.callerUid || '').slice(0, 128);
    const listenerUid = String(req.body?.listenerUid || '').slice(0, 128);
    const listenerName = String(req.body?.listenerName || '').slice(0, 100);
    if (callerName) client.parameter({ name: 'callerName', value: callerName });
    if (callerUid) client.parameter({ name: 'callerUid', value: callerUid });
    if (listenerUid) client.parameter({ name: 'listenerUid', value: listenerUid });
    if (listenerName) client.parameter({ name: 'listenerName', value: listenerName });

    if (statusCallbackUrl) {
      console.log('[TwiML] statusCallback:', statusCallbackUrl);
    } else {
      console.warn('[TwiML] No STATUS_CALLBACK_BASE_URL or MAIN_BACKEND_URL — billing callbacks disabled');
    }
  } else {
    console.warn('[TwiML] No "To" parameter — hanging up');
    twiml.say('No destination specified.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

module.exports = router;
