const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { getWallet, setWalletBalance } = require('../store/wallet');
const { CALL_SERVER_URL, PORT } = require('../config');
const { db, FieldValue } = require('../firebase-admin');

const twilio = require('twilio');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const router = Router();

/**
 * POST /api/calls/end/:callSid
 * Ends an active Twilio call.
 */
router.post('/end/:callSid', async (req, res) => {
  const callSid = String(req.params.callSid || '').trim();
  if (!callSid) return res.status(400).json({ error: 'CallSid is required' });

  try {
    await twilioClient.calls(callSid).update({ status: 'completed' });
  } catch (err) {
    console.error('End call error:', err.message);
  }

  // Clear listener busy flag
  try {
    const callDoc = await db.collection('activeCalls').doc(callSid).get();
    if (callDoc.exists && callDoc.data().listenerId) {
      await db.collection('listenerProfiles').doc(callDoc.data().listenerId).update({ isBusy: false, activeCallSid: null });
    }
  } catch (_) {}

  return res.json({ success: true });
});

/**
 * POST /api/calls/preflight
 * Verifies minimum balance, initiates Twilio call.
 * Actual billing happens post-call via Twilio status callback (1 coin / 10 sec).
 */
router.post('/preflight', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const { listenerId, listenerName } = req.body;
  const target = String(req.body?.to || '').trim().toLowerCase();
  if (!target) return res.status(400).json({ error: 'Target username is required' });

  // Determine routing mode
  let listenerPhone = null;
  const routingMode = listenerId ? 'firestore-listener' : 'fallback-demo';
  console.log('Routing mode:', routingMode);

  if (routingMode === 'firestore-listener') {
    const listenerDoc = await db.collection('listenerProfiles').doc(listenerId).get();
    if (!listenerDoc.exists) {
      return res.status(404).json({ error: 'Listener not found' });
    }

    const listener = listenerDoc.data();

    if (listener.status !== 'approved') {
      return res.status(400).json({ error: 'Listener not approved' });
    }
    if (!listener.isOnline) {
      return res.status(400).json({ error: 'Listener is offline' });
    }
    if (listener.isBusy) {
      return res.status(409).json({ error: 'Listener is on another call' });
    }
    if (!listener.phone) {
      return res.status(400).json({ error: 'Listener phone not available' });
    }

    listenerPhone = listener.phone;
    console.log('Firestore listener resolved — listenerId:', listenerId, 'listenerName:', listenerName, 'listenerPhone:', listenerPhone);
  } else {
    console.log('Fallback demo — target:', target);
  }

  // Verify caller has at least 1 coin before allowing the call attempt
  const wallet = await getWallet(user);
  if (wallet.balance < 1) {
    return res.status(402).json({
      error: 'At least 1 coin is required to start a call',
      ...wallet,
    });
  }

  // Calculate max call duration based on current balance (1 coin = 10 sec)
  const startingBalance = wallet.balance;
  const maxAllowedDurationSeconds = startingBalance * 10;
  console.log('Balance check passed — balance:', startingBalance, 'maxAllowedDurationSeconds:', maxAllowedDurationSeconds);

  // Trigger real Twilio call (no upfront deduction — billed post-call)
  let callResult = null;
  const statusCallbackUrl = `${process.env.STATUS_CALLBACK_BASE_URL || `http://localhost:${PORT}`}/api/calls/status`;
  try {
    const callPayload = {
      target,
      statusCallbackUrl,
      timeLimit: maxAllowedDurationSeconds,
      ...(listenerPhone ? { listenerPhone, listenerId, listenerName } : {}),
    };
    console.log('Sending to Twilio call server:', callPayload);

    const callRes = await fetch(`${CALL_SERVER_URL}/api/call/${encodeURIComponent(target)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
    });
    callResult = await callRes.json();
  } catch (err) {
    console.log('Twilio request failed:', err.message);
    return res.status(502).json({ error: 'Call failed' });
  }

  // Save call metadata for status callback tracking
  const callSid = callResult?.callSid || null;

  // Mark listener as busy
  if (callSid && listenerId) {
    try {
      await db.collection('listenerProfiles').doc(listenerId).update({ isBusy: true, activeCallSid: callSid });
      console.log('Listener marked busy — listenerId:', listenerId);
    } catch (busyErr) {
      console.error('Failed to mark listener busy:', busyErr.message);
    }
  }

  if (callSid) {
    try {
      await db.collection('activeCalls').doc(callSid).set({
        callSid,
        callerUid: user.uid,
        callerPhone: user.phone,
        listenerId: listenerId || null,
        listenerName: listenerName || null,
        listenerPhone: listenerPhone || null,
        routingMode,
        status: 'initiated',
        answered: false,
        charged: false,
        chargedCoins: 0,
        durationSeconds: 0,
        startingBalance,
        maxAllowedDurationSeconds,
        endedDueToLowBalance: false,
        createdAt: new Date(),
      });
      console.log('Call metadata saved for callSid:', callSid);
    } catch (metaErr) {
      console.error('Failed to save call metadata:', metaErr.message);
    }
  }

  return res.json({
    allowed: true,
    target,
    routingMode,
    mode: callResult?.success ? 'live' : 'demo',
    callSid,
    billingModel: 'per-second',
    coinRate: '1 coin / 10 sec',
    maxAllowedDurationSeconds,
    wallet,
    listener: listenerId ? { listenerId, listenerName, listenerPhone } : null,
    note: callResult?.success
      ? `Calling ${String(target).replace(/^@+/, '')} now. Billed after call ends.`
      : `Demo call for ${String(target).replace(/^@+/, '')}. No charge.`,
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

/**
 * POST /api/calls/status
 * Receives Twilio statusCallback events for active calls.
 * Billing: 1 coin per 10 seconds of talk time (charged post-call).
 * Not-answered calls (busy/no-answer/failed/canceled) = 0 coins.
 */
const NO_CHARGE_STATUSES = new Set(['busy', 'no-answer', 'failed', 'canceled']);

router.post('/status', async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const callDuration = Number(req.body.CallDuration || req.body.Duration || 0);

  console.log('Twilio status callback — callSid:', callSid, 'status:', callStatus, 'duration:', callDuration);

  if (!callSid) {
    return res.status(400).send('Missing CallSid');
  }

  const callRef = db.collection('activeCalls').doc(callSid);
  let callDoc;
  try {
    callDoc = await callRef.get();
  } catch (err) {
    console.error('Failed to fetch call metadata:', err.message);
    return res.sendStatus(200);
  }

  if (!callDoc.exists) {
    console.log('No call metadata found for callSid:', callSid, '— skipping');
    return res.sendStatus(200);
  }

  const callData = callDoc.data();

  // Always update the latest status
  const statusUpdate = { status: callStatus, updatedAt: new Date() };

  // --- Idempotency: skip if already finalized ---
  if (callData.finalized) {
    console.log('Duplicate finalization skipped — callSid:', callSid);
    // Still update status in case Twilio sends additional events
    try { await callRef.update(statusUpdate); } catch (_) {}
    return res.sendStatus(200);
  }

  const LISTENER_PAYOUT_RATE = 0.4;
  const completedAt = new Date();

  // Handle completed/answered calls — charge based on duration
  if (callStatus === 'completed' && callDuration > 0) {
    const durationSeconds = callDuration;
    const chargedCoins = Math.ceil(durationSeconds / 10);
    const listenerEarnedCoins = Math.floor(chargedCoins * LISTENER_PAYOUT_RATE);

    console.log('Call completed — durationSeconds:', durationSeconds, 'chargedCoins:', chargedCoins, 'listenerEarnedCoins:', listenerEarnedCoins);

    // Detect if call was ended due to balance limit
    const hitLimit = callData.maxAllowedDurationSeconds && durationSeconds >= callData.maxAllowedDurationSeconds;
    if (hitLimit) {
      console.log('Call ended due to low balance — maxAllowed:', callData.maxAllowedDurationSeconds, 'actual:', durationSeconds);
    }

    statusUpdate.answered = true;
    statusUpdate.durationSeconds = durationSeconds;
    statusUpdate.chargedCoins = chargedCoins;
    statusUpdate.listenerEarnedCoins = listenerEarnedCoins;
    statusUpdate.finalStatus = callStatus;
    statusUpdate.endedDueToLowBalance = hitLimit || false;
    statusUpdate.completedAt = completedAt;
    statusUpdate.finalized = true;

    // Deduct from caller wallet
    try {
      const user = { uid: callData.callerUid, phone: callData.callerPhone, authMode: 'callback' };
      const walletResult = await setWalletBalance(user, -chargedCoins);
      statusUpdate.charged = true;
      console.log('Wallet deduction — chargedCoins:', chargedCoins, 'newBalance:', walletResult.balance);
    } catch (chargeErr) {
      console.error('Wallet deduction failed — callSid:', callSid, 'error:', chargeErr.message);
    }

    // Save session record for caller
    try {
      const sessionData = {
        callSid,
        listenerId: callData.listenerId || null,
        listenerName: callData.listenerName || null,
        listenerPhone: callData.listenerPhone || null,
        durationSeconds,
        chargedCoins,
        finalStatus: callStatus,
        routingMode: callData.routingMode,
        endedDueToLowBalance: hitLimit || false,
        createdAt: callData.createdAt,
        completedAt,
      };
      await db.collection('users').doc(callData.callerUid).collection('sessions').add(sessionData);
      console.log('Session saved for caller — callerUid:', callData.callerUid, 'callSid:', callSid);
    } catch (sessionErr) {
      console.error('Session save failed — callSid:', callSid, 'error:', sessionErr.message);
    }

    // Credit listener earnings (only if chargedCoins > 0 and listener exists)
    if (chargedCoins > 0 && listenerEarnedCoins > 0 && callData.listenerId) {
      try {
        await db.collection('listenerProfiles').doc(callData.listenerId).update({
          totalCoinsEarned: FieldValue.increment(listenerEarnedCoins),
          availableCoins: FieldValue.increment(listenerEarnedCoins),
        });
        console.log('Listener earnings credited — listenerId:', callData.listenerId, 'listenerEarnedCoins:', listenerEarnedCoins);
      } catch (earnErr) {
        console.error('Listener earnings credit failed — listenerId:', callData.listenerId, 'error:', earnErr.message);
      }

      // Save session record for listener
      try {
        const listenerSessionData = {
          callSid,
          callerUid: callData.callerUid || null,
          durationSeconds,
          earnedCoins: listenerEarnedCoins,
          finalStatus: callStatus,
          endedDueToLowBalance: hitLimit || false,
          completedAt,
        };
        await db.collection('listenerProfiles').doc(callData.listenerId).collection('sessions').add(listenerSessionData);
        console.log('Listener session saved — listenerId:', callData.listenerId, 'callSid:', callSid);
      } catch (lsErr) {
        console.error('Listener session save failed — listenerId:', callData.listenerId, 'error:', lsErr.message);
      }
    }
  }

  // Handle not-answered calls — 0 charge
  if (NO_CHARGE_STATUSES.has(callStatus) && !callData.finalized) {
    console.log('Call not answered (status:', callStatus, ') — 0 coins charged');
    statusUpdate.answered = false;
    statusUpdate.durationSeconds = 0;
    statusUpdate.chargedCoins = 0;
    statusUpdate.listenerEarnedCoins = 0;
    statusUpdate.finalStatus = callStatus;
    statusUpdate.charged = true;
    statusUpdate.completedAt = completedAt;
    statusUpdate.finalized = true;

    // Save session record for not-answered calls
    try {
      const sessionData = {
        callSid,
        listenerId: callData.listenerId || null,
        listenerName: callData.listenerName || null,
        listenerPhone: callData.listenerPhone || null,
        durationSeconds: 0,
        chargedCoins: 0,
        finalStatus: callStatus,
        routingMode: callData.routingMode,
        endedDueToLowBalance: false,
        createdAt: callData.createdAt,
        completedAt,
      };
      await db.collection('users').doc(callData.callerUid).collection('sessions').add(sessionData);
      console.log('Session saved (not answered) — callerUid:', callData.callerUid, 'callSid:', callSid);
    } catch (sessionErr) {
      console.error('Session save failed — callSid:', callSid, 'error:', sessionErr.message);
    }
  }

  // Handle completed with 0 duration (rang but never picked up)
  if (callStatus === 'completed' && callDuration === 0 && !callData.finalized) {
    console.log('Call completed with 0 duration — 0 coins charged');
    statusUpdate.answered = false;
    statusUpdate.durationSeconds = 0;
    statusUpdate.chargedCoins = 0;
    statusUpdate.listenerEarnedCoins = 0;
    statusUpdate.finalStatus = callStatus;
    statusUpdate.charged = true;
    statusUpdate.completedAt = completedAt;
    statusUpdate.finalized = true;

    // Save session record
    try {
      const sessionData = {
        callSid,
        listenerId: callData.listenerId || null,
        listenerName: callData.listenerName || null,
        listenerPhone: callData.listenerPhone || null,
        durationSeconds: 0,
        chargedCoins: 0,
        finalStatus: callStatus,
        routingMode: callData.routingMode,
        endedDueToLowBalance: false,
        createdAt: callData.createdAt,
        completedAt,
      };
      await db.collection('users').doc(callData.callerUid).collection('sessions').add(sessionData);
      console.log('Session saved (0 duration) — callerUid:', callData.callerUid, 'callSid:', callSid);
    } catch (sessionErr) {
      console.error('Session save failed — callSid:', callSid, 'error:', sessionErr.message);
    }
  }

  try {
    await callRef.update(statusUpdate);
  } catch (err) {
    console.error('Failed to update call status:', err.message);
  }

  // Clear listener busy flag when call is finalized
  if (statusUpdate.finalized && callData.listenerId) {
    try {
      await db.collection('listenerProfiles').doc(callData.listenerId).update({ isBusy: false, activeCallSid: null });
      console.log('Listener busy cleared — listenerId:', callData.listenerId);
    } catch (clearErr) {
      console.error('Failed to clear listener busy:', clearErr.message);
    }
  }

  return res.sendStatus(200);
});

/**
 * GET /api/calls/status/:callSid
 * Returns current call state. Uses Firestore first; if not finalized,
 * falls back to Twilio REST API for live status.
 */
router.get('/status/:callSid', async (req, res) => {
  const callSid = req.params.callSid;
  if (!callSid) return res.status(400).json({ error: 'callSid is required' });

  try {
    const doc = await db.collection('activeCalls').doc(callSid).get();
    if (!doc.exists) return res.status(404).json({ error: 'Call not found' });

    const d = doc.data();

    // If already finalized, return Firestore data immediately
    if (d.finalized) {
      return res.json({
        callSid,
        status: d.status,
        answered: d.answered || false,
        finalized: true,
        durationSeconds: d.durationSeconds || 0,
        chargedCoins: d.chargedCoins || 0,
        finalStatus: d.finalStatus || null,
        endedDueToLowBalance: d.endedDueToLowBalance || false,
      });
    }

    // Not finalized — check Twilio for live status
    let twilioStatus = d.status;
    let twilioDuration = 0;
    try {
      const twilioCall = await twilioClient.calls(callSid).fetch();
      twilioStatus = twilioCall.status; // queued, ringing, in-progress, completed, busy, no-answer, canceled, failed
      twilioDuration = Number(twilioCall.duration) || 0;
    } catch (twilioErr) {
      console.error('Twilio fetch failed for callSid:', callSid, twilioErr.message);
    }

    return res.json({
      callSid,
      status: twilioStatus,
      answered: d.answered || twilioStatus === 'in-progress' || (twilioStatus === 'completed' && twilioDuration > 0),
      finalized: false,
      durationSeconds: d.durationSeconds || twilioDuration,
      chargedCoins: d.chargedCoins || 0,
      finalStatus: d.finalStatus || null,
      endedDueToLowBalance: d.endedDueToLowBalance || false,
    });
  } catch (err) {
    console.error('Failed to fetch call status:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
