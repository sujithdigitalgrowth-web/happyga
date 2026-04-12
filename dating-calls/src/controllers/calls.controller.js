const { makeCall } = require('../services/twilio.service');
const { getPhoneByUsername } = require('../data/users');

/**
 * Normalize an Indian phone number to E.164 format.
 */
function normalizePhoneE164(raw) {
  if (!raw) return raw;
  let phone = String(raw).trim();
  const hasPlus = phone.startsWith('+');
  phone = phone.replace(/[^\d]/g, '');
  if (hasPlus) phone = '+' + phone;
  if (/^\d{10}$/.test(phone)) phone = '+91' + phone;
  return phone;
}

/**
 * POST /api/call
 * Body: { toNumber: '+91...' }
 * Calls a raw phone number directly.
 */
async function callByNumber(req, res) {
  const rawNumber = String(req.body?.toNumber || '').trim();
  if (!rawNumber) {
    return res.status(400).json({ success: false, error: 'toNumber is required' });
  }
  const toNumber = normalizePhoneE164(rawNumber);
  console.log('[callByNumber] raw:', rawNumber, '-> E.164:', toNumber);

  try {
    const result = await makeCall(toNumber);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[callByNumber] Twilio error:', err.message, '| code:', err.code, '| status:', err.status, '| moreInfo:', err.moreInfo);
    return res.status(500).json({ success: false, error: err.message, code: err.code, status: err.status });
  }
}

/**
 * POST /api/call/:username
 * Looks up the user's registered phone and calls it automatically.
 * If listenerPhone is provided in the body (from main backend), uses that directly.
 */
async function callByUsername(req, res) {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }

  const { listenerPhone, listenerId, listenerName, target, statusCallbackUrl, timeLimit } = req.body || {};

  const rawTarget = listenerPhone || getPhoneByUsername(username);
  const outboundTarget = normalizePhoneE164(rawTarget);

  console.log('[callByUsername] ---- Call Request Debug ----');
  console.log('  listenerId:', listenerId);
  console.log('  listenerName:', listenerName);
  console.log('  listenerPhone (raw):', listenerPhone);
  console.log('  outboundTarget (E.164):', outboundTarget);
  console.log('  from number:', process.env.TWILIO_PHONE_NUMBER);
  console.log('  target:', target);
  console.log('  statusCallbackUrl:', statusCallbackUrl);
  console.log('  timeLimit:', timeLimit);

  if (!outboundTarget) {
    return res.status(404).json({
      success: false,
      error: `No phone number registered for @${username}`,
    });
  }

  try {
    const callOptions = {};
    if (statusCallbackUrl) {
      callOptions.statusCallback = statusCallbackUrl;
    }
    if (timeLimit && Number(timeLimit) > 0) {
      callOptions.timeLimit = Number(timeLimit);
    }
    const result = await makeCall(outboundTarget, callOptions);
    console.log('[callByUsername] Twilio call SUCCESS:', JSON.stringify(result));
    return res.json({ success: true, username, ...result });
  } catch (err) {
    console.error('[callByUsername] Twilio call FAILED:');
    console.error('  message:', err.message);
    console.error('  code:', err.code);
    console.error('  status:', err.status);
    console.error('  moreInfo:', err.moreInfo);
    console.error('  details:', err.details);
    return res.status(500).json({ success: false, error: err.message, code: err.code, status: err.status, moreInfo: err.moreInfo });
  }
}

module.exports = { callByNumber, callByUsername };
