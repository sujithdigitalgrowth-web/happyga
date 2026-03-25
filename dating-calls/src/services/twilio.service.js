const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

const VOICE_XML_URL =
  process.env.TWILIO_VOICE_XML_URL || 'http://demo.twilio.com/docs/voice.xml';

async function makeCall(toNumber) {
  const call = await client.calls.create({
    url: VOICE_XML_URL,
    to: toNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
  });

  return { callSid: call.sid, to: toNumber, status: call.status };
}

module.exports = { makeCall };
