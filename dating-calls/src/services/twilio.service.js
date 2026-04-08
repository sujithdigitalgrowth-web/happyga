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
    console.log('Twilio timeLimit set:', options.timeLimit, 'seconds');
  }

  const call = await client.calls.create(callParams);
  return { callSid: call.sid, to: toNumber, status: call.status };
}

module.exports = { makeCall };
