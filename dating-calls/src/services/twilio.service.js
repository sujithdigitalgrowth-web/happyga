const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

const VOICE_XML_URL =
  process.env.TWILIO_VOICE_XML_URL || 'http://demo.twilio.com/docs/voice.xml';

async function makeCall(toNumber, options = {}) {
  const callParams = {
    url: VOICE_XML_URL,
    to: toNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
  };

  if (options.statusCallback) {
    callParams.statusCallback = options.statusCallback;
    callParams.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed', 'canceled'];
    callParams.statusCallbackMethod = 'POST';
  }

  if (options.timeLimit && options.timeLimit > 0) {
    callParams.timeLimit = options.timeLimit;
  }

  console.log('[makeCall] ---- Twilio calls.create() params ----');
  console.log('  to:', callParams.to);
  console.log('  from:', callParams.from);
  console.log('  url (TwiML):', callParams.url);
  console.log('  timeLimit:', callParams.timeLimit || 'not set');
  console.log('  statusCallback:', callParams.statusCallback || 'not set');

  try {
    const call = await client.calls.create(callParams);
    console.log('[makeCall] SUCCESS — callSid:', call.sid, 'status:', call.status);
    return { callSid: call.sid, to: toNumber, status: call.status };
  } catch (err) {
    console.error('[makeCall] TWILIO API ERROR:');
    console.error('  message:', err.message);
    console.error('  code:', err.code);
    console.error('  status:', err.status);
    console.error('  moreInfo:', err.moreInfo);
    console.error('  details:', JSON.stringify(err.details));
    throw err;
  }
}

module.exports = { makeCall };
