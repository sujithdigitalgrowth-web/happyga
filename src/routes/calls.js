const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { getWallet, setWalletBalance } = require('../store/wallet');
const { CALL_COST_COINS, LISTENER_PAYOUT_RATE, CALL_SERVER_URL } = require('../config');

const router = Router();

/**
 * POST /api/calls/preflight
 * Checks coins, deducts them, then triggers a real Twilio call
 * to the matched user's registered phone via the call micro-server.
 */
router.post('/preflight', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const target = String(req.body?.to || '').trim().toLowerCase();
  if (!target) return res.status(400).json({ error: 'Target username is required' });

  const wallet = await getWallet(user);
  if (wallet.balance < CALL_COST_COINS) {
    return res.status(402).json({
      error: `At least ${CALL_COST_COINS} coins are required to start a call`,
      ...wallet,
    });
  }

  const updatedWallet = await setWalletBalance(user, -CALL_COST_COINS);

  // Trigger real Twilio call to the matched user by username
  let callResult = null;
  try {
    const callRes = await fetch(`${CALL_SERVER_URL}/api/call/${encodeURIComponent(target)}`, {
      method: 'POST',
    });
    callResult = await callRes.json();
  } catch {
    // Call server unreachable — still return preflight success so UI works
    callResult = { success: false, error: 'Call server unreachable' };
  }

  return res.json({
    allowed: true,
    target,
    mode: callResult?.success ? 'live' : 'demo',
    callSid: callResult?.callSid || null,
    callCostCoins: CALL_COST_COINS,
    listenerPayoutCoins: Number((CALL_COST_COINS * LISTENER_PAYOUT_RATE).toFixed(1)),
    estimatedDuration: '01m 00s',
    wallet: updatedWallet,
    note: callResult?.success
      ? `Calling @${target} now. ${CALL_COST_COINS} coins reserved.`
      : `Demo call for @${target}. ${CALL_COST_COINS} coins reserved.`,
  });
});

/**
 * POST /api/call
 * Proxy: raw number or username-based call forwarded to call server.
 */
router.post('/', async (req, res) => {
  const toNumber = String(req.body?.toNumber || '').trim();
  if (!toNumber) return res.status(400).json({ success: false, error: 'toNumber is required' });

  try {
    const callRes = await fetch(`${CALL_SERVER_URL}/api/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ toNumber }),
    });
    const data = await callRes.json();
    return res.status(callRes.status).json(data);
  } catch {
    return res.status(502).json({ success: false, error: 'Call server unreachable' });
  }
});

/**
 * POST /api/calls/ring/:username
 * Triggers a real Twilio call to the matched user's phone (alias endpoint).
 */
router.post('/ring/:username', async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (!username) return res.status(400).json({ success: false, error: 'Username is required' });

  try {
    const callRes = await fetch(`${CALL_SERVER_URL}/api/call/${encodeURIComponent(username)}`, {
      method: 'POST',
    });
    const data = await callRes.json();
    return res.status(callRes.status).json(data);
  } catch {
    return res.status(502).json({ success: false, error: 'Call server unreachable' });
  }
});

module.exports = router;
