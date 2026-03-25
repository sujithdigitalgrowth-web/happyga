const { makeCall } = require('../services/twilio.service');
const { getPhoneByUsername } = require('../data/users');

/**
 * POST /api/call
 * Body: { toNumber: '+91...' }
 * Calls a raw phone number directly.
 */
async function callByNumber(req, res) {
  const toNumber = String(req.body?.toNumber || '').trim();
  if (!toNumber) {
    return res.status(400).json({ success: false, error: 'toNumber is required' });
  }

  try {
    const result = await makeCall(toNumber);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/call/:username
 * Looks up the user's registered phone and calls it automatically.
 */
async function callByUsername(req, res) {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }

  const phone = getPhoneByUsername(username);
  if (!phone) {
    return res.status(404).json({
      success: false,
      error: `No phone number registered for @${username}`,
    });
  }

  try {
    const result = await makeCall(phone);
    return res.json({ success: true, username, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { callByNumber, callByUsername };
