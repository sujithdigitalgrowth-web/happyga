const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { getWallet, setWalletBalance } = require('../store/wallet');
const { CALL_SERVER_URL, PORT } = require('../config');
const { db, FieldValue } = require('../firebase-admin');

const twilio = require('twilio');
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Normalize an Indian phone number to E.164 format.
 * - Trims spaces, strips non-digit chars (except leading +)
 * - 10-digit Indian number → +91XXXXXXXXXX
 * - Already starts with + → keep as-is
 */
function normalizePhoneE164(raw) {
  if (!raw) return raw;
  let phone = String(raw).trim();
  // keep leading + if present, strip everything else that isn't a digit
  const hasPlus = phone.startsWith('+');
  phone = phone.replace(/[^\d]/g, '');
  if (hasPlus) phone = '+' + phone;
  // 10-digit Indian mobile → prefix +91
  if (/^\d{10}$/.test(phone)) phone = '+91' + phone;
  return phone;
}

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

    if (String(listener.status || '').toLowerCase() !== 'approved') {
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

    const rawPhone = listener.phone;
    listenerPhone = normalizePhoneE164(rawPhone);
    console.log('[preflight] Listener profile from Firestore:');
    console.log('  uid/listenerId:', listenerId);
    console.log('  displayName:', listener.displayName || listenerName);
    console.log('  phone (raw):', rawPhone);
    console.log('  phone (E.164):', listenerPhone);
    console.log('  status:', listener.status);
    console.log('  isOnline:', listener.isOnline);
    console.log('  isBusy:', listener.isBusy);
    console.log('[preflight] Caller uid:', user.uid);
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
  const maxAllowedDurationSeconds = Math.min(startingBalance * 10, 600);
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

    const callUrl = `${CALL_SERVER_URL}/api/call/${encodeURIComponent(target)}`;
    console.log('[preflight] Fetching call server:', callUrl);
    const callRes = await fetch(callUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
    });
    callResult = await callRes.json();
    console.log('[preflight] Call server response:', JSON.stringify(callResult));
    if (!callResult.success) {
      console.error('[preflight] Call server returned failure:', callResult.error, 'code:', callResult.code);
      return res.status(callRes.status || 502).json({ error: callResult.error || 'Call failed', code: callResult.code, moreInfo: callResult.moreInfo });
    }
  } catch (err) {
    console.error('[preflight] Call server fetch FAILED:', err.message, err.cause || '');
    return res.status(502).json({ error: 'Call failed — call server unreachable', detail: err.message });
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
        callTransport: 'pstn',
        routingMode,
        status: 'initiated',
        answered: false,
        charged: false,
        finalized: false,
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
 * POST /api/calls/app-preflight
 * Creates an activeCalls record for app-to-app Voice SDK calls.
 * Called by the frontend before the Twilio Device connects, so the
 * status callback has the metadata it needs to finalize billing.
 */
router.post('/app-preflight', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const callerUid = user.uid;
  const callerPhone = user.phone || null;
  const listenerUid = String(req.body?.listenerUid || '').trim();
  const listenerName = String(req.body?.listenerName || '').trim().slice(0, 100);
  const callerName = String(req.body?.callerName || '').trim().slice(0, 100);

  if (!listenerUid) {
    return res.status(400).json({ error: 'listenerUid is required' });
  }

  // Verify caller has at least 1 coin
  const wallet = await getWallet(user);
  if (wallet.balance < 1) {
    return res.status(402).json({
      error: 'At least 1 coin is required to start a call',
      ...wallet,
    });
  }

  const startingBalance = wallet.balance;
  const maxAllowedDurationSeconds = startingBalance * 10;

  // Generate a placeholder call ID — Twilio's real CallSid arrives in the
  // status callback.  We create the record keyed by a temporary ID so the
  // frontend can pass it back later, but the callback itself will match
  // on callSid once Twilio sends it.
  const tempCallId = `app_${callerUid}_${Date.now()}`;

  try {
    await db.collection('activeCalls').doc(tempCallId).set({
      callSid: null,                       // real sid filled by callback
      tempCallId,
      callerUid,
      callerPhone,
      callerName: callerName || null,
      listenerId: listenerUid,
      listenerName: listenerName || null,
      listenerPhone: null,                 // not used for app-to-app
      callTransport: 'voice-client',
      routingMode: 'voice-client',
      status: 'initiated',
      answered: false,
      charged: false,
      finalized: false,
      chargedCoins: 0,
      durationSeconds: 0,
      startingBalance,
      maxAllowedDurationSeconds,
      endedDueToLowBalance: false,
      createdAt: new Date(),
    });
    console.log('[app-preflight] activeCalls record created — tempCallId:', tempCallId, 'callerUid:', callerUid, 'listenerUid:', listenerUid);
  } catch (err) {
    console.error('[app-preflight] Failed to create activeCalls record:', err.message);
    return res.status(500).json({ error: 'Failed to create call record' });
  }

  // Mark listener busy
  try {
    await db.collection('listenerProfiles').doc(listenerUid).update({ isBusy: true, activeCallSid: tempCallId });
    console.log('[app-preflight] Listener marked busy — listenerUid:', listenerUid);
  } catch (busyErr) {
    // Non-fatal — listener doc might not exist for demo profiles
    console.warn('[app-preflight] Failed to mark listener busy:', busyErr.message);
  }

  return res.json({
    allowed: true,
    tempCallId,
    callTransport: 'voice-client',
    maxAllowedDurationSeconds,
    wallet,
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
 * Supports both PSTN and voice-client (app-to-app) transports.
 * Billing: 1 coin per 10 seconds of talk time (charged post-call).
 * Not-answered calls (busy/no-answer/failed/canceled) = 0 coins.
 */
const NO_CHARGE_STATUSES = new Set(['busy', 'no-answer', 'failed', 'canceled']);

/**
 * Resolve activeCalls record for the given CallSid.
 * For voice-client calls the Twilio CallSid won't match the tempCallId we stored,
 * so we also search by callerUid (from the callback's From identity).
 */
async function resolveActiveCall(callSid, reqBody) {
  // 1) Direct lookup by CallSid
  const directRef = db.collection('activeCalls').doc(callSid);
  const directDoc = await directRef.get();
  if (directDoc.exists) return { ref: directRef, doc: directDoc };

  // 2) For voice-client calls — find the unfinalized record by callerUid
  //    The callback "From" is "client:<identity>" for SDK calls.
  const from = String(reqBody.From || '');
  const callerIdentity = from.startsWith('client:') ? from.slice(7) : null;

  if (callerIdentity) {
    const snap = await db.collection('activeCalls')
      .where('callTransport', '==', 'voice-client')
      .where('finalized', '==', false)
      .limit(10)
      .get();

    for (const d of snap.docs) {
      const data = d.data();
      // Match on callerUid identity
      const storedIdentity = String(data.callerUid || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 121);
      if (storedIdentity === callerIdentity) {
        // Bind the real CallSid onto the record for future direct lookups
        try {
          await d.ref.update({ callSid });
        } catch (_) {}
        return { ref: d.ref, doc: d };
      }
    }
  }

  return { ref: null, doc: null };
}

router.post('/status', async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const callDuration = Number(req.body.CallDuration || req.body.Duration || 0);

  console.log('[status-cb] Twilio callback — callSid:', callSid, 'status:', callStatus, 'duration:', callDuration);

  if (!callSid) {
    return res.status(400).send('Missing CallSid');
  }

  let callRef, callDoc;
  try {
    ({ ref: callRef, doc: callDoc } = await resolveActiveCall(callSid, req.body));
  } catch (err) {
    console.error('[status-cb] Failed to resolve call metadata:', err.message);
    return res.sendStatus(200);
  }

  if (!callDoc || !callDoc.exists) {
    console.log('[status-cb] No call metadata found for callSid:', callSid, '— skipping');
    return res.sendStatus(200);
  }

  const callData = callDoc.data();
  const transport = callData.callTransport || 'pstn';

  // Always update the latest status
  const statusUpdate = { status: callStatus, updatedAt: new Date() };

  // --- Idempotency: skip if already finalized ---
  if (callData.finalized) {
    console.log('[status-cb] Duplicate finalization skipped — callSid:', callSid, 'transport:', transport);
    try { await callRef.update(statusUpdate); } catch (_) {}
    return res.sendStatus(200);
  }

  const LISTENER_PAYOUT_RATE = 0.4;
  const completedAt = new Date();

  // ── Helper: finalize a completed/answered call ──
  if (callStatus === 'completed' && callDuration > 0) {
    const durationSeconds = callDuration;
    const chargedCoins = Math.ceil(durationSeconds / 10);
    const listenerEarnedCoins = Math.floor(chargedCoins * LISTENER_PAYOUT_RATE);

    const hitLimit = callData.maxAllowedDurationSeconds && durationSeconds >= callData.maxAllowedDurationSeconds;

    statusUpdate.answered = true;
    statusUpdate.connected = true;
    statusUpdate.durationSeconds = durationSeconds;
    statusUpdate.chargedCoins = chargedCoins;
    statusUpdate.listenerEarnedCoins = listenerEarnedCoins;
    statusUpdate.finalStatus = callStatus;
    statusUpdate.endedDueToLowBalance = hitLimit || false;
    statusUpdate.completedAt = completedAt;
    statusUpdate.finalized = true;
    if (!callData.callSid) statusUpdate.callSid = callSid; // bind real sid

    // Deduct from caller wallet
    try {
      const user = { uid: callData.callerUid, phone: callData.callerPhone, authMode: 'callback' };
      const walletResult = await setWalletBalance(user, -chargedCoins);
      statusUpdate.charged = true;
      console.log('[status-cb] Wallet deduction — chargedCoins:', chargedCoins, 'newBalance:', walletResult.balance);
    } catch (chargeErr) {
      console.error('[status-cb] Wallet deduction failed — callSid:', callSid, 'error:', chargeErr.message);
    }

    // Save session record for caller
    try {
      const sessionData = {
        callSid,
        listenerId: callData.listenerId || null,
        listenerName: callData.listenerName || null,
        listenerPhone: callData.listenerPhone || null,
        connected: true,
        durationSeconds,
        chargedCoins,
        finalStatus: callStatus,
        routingMode: callData.routingMode,
        callTransport: transport,
        endedDueToLowBalance: hitLimit || false,
        createdAt: callData.createdAt,
        completedAt,
      };
      await db.collection('users').doc(callData.callerUid).collection('sessions').add(sessionData);
      console.log('[status-cb] Session saved for caller — callerUid:', callData.callerUid);
    } catch (sessionErr) {
      console.error('[status-cb] Session save failed — callSid:', callSid, 'error:', sessionErr.message);
    }

    // Credit listener earnings
    if (chargedCoins > 0 && listenerEarnedCoins > 0 && callData.listenerId) {
      try {
        await db.collection('listenerProfiles').doc(callData.listenerId).update({
          totalCoinsEarned: FieldValue.increment(listenerEarnedCoins),
          availableCoins: FieldValue.increment(listenerEarnedCoins),
        });
        console.log('[status-cb] Listener earnings credited — listenerId:', callData.listenerId, 'listenerEarnedCoins:', listenerEarnedCoins);
      } catch (earnErr) {
        console.error('[status-cb] Listener earnings credit failed — listenerId:', callData.listenerId, 'error:', earnErr.message);
      }

      // Save session record for listener
      try {
        const listenerSessionData = {
          callSid,
          callerUid: callData.callerUid || null,
          connected: true,
          durationSeconds,
          earnedCoins: listenerEarnedCoins,
          finalStatus: callStatus,
          callTransport: transport,
          endedDueToLowBalance: hitLimit || false,
          completedAt,
        };
        await db.collection('listenerProfiles').doc(callData.listenerId).collection('sessions').add(listenerSessionData);
        console.log('[status-cb] Listener session saved — listenerId:', callData.listenerId);
      } catch (lsErr) {
        console.error('[status-cb] Listener session save failed — listenerId:', callData.listenerId, 'error:', lsErr.message);
      }
    }

    // Debug summary
    console.log('[status-cb] FINALIZED — callSid:', callSid, 'transport:', transport, 'status:', callStatus,
      'duration:', durationSeconds, 'chargedCoins:', chargedCoins, 'listenerCredited:', listenerEarnedCoins);
  }

  // ── Handle not-answered calls — 0 charge ──
  if (NO_CHARGE_STATUSES.has(callStatus) && !callData.finalized) {
    statusUpdate.answered = false;
    statusUpdate.connected = false;
    statusUpdate.durationSeconds = 0;
    statusUpdate.chargedCoins = 0;
    statusUpdate.listenerEarnedCoins = 0;
    statusUpdate.finalStatus = callStatus;
    statusUpdate.charged = true;
    statusUpdate.completedAt = completedAt;
    statusUpdate.finalized = true;
    if (!callData.callSid) statusUpdate.callSid = callSid;

    try {
      const sessionData = {
        callSid,
        listenerId: callData.listenerId || null,
        listenerName: callData.listenerName || null,
        listenerPhone: callData.listenerPhone || null,
        connected: false,
        durationSeconds: 0,
        chargedCoins: 0,
        finalStatus: callStatus,
        routingMode: callData.routingMode,
        callTransport: transport,
        endedDueToLowBalance: false,
        createdAt: callData.createdAt,
        completedAt,
      };
      await db.collection('users').doc(callData.callerUid).collection('sessions').add(sessionData);
    } catch (sessionErr) {
      console.error('[status-cb] Session save failed — callSid:', callSid, 'error:', sessionErr.message);
    }

    console.log('[status-cb] FINALIZED (no-charge) — callSid:', callSid, 'transport:', transport, 'status:', callStatus,
      'duration: 0, chargedCoins: 0, listenerCredited: 0');
  }

  // ── Handle completed with 0 duration (rang but never picked up) ──
  if (callStatus === 'completed' && callDuration === 0 && !callData.finalized && !statusUpdate.finalized) {
    statusUpdate.answered = false;
    statusUpdate.connected = false;
    statusUpdate.durationSeconds = 0;
    statusUpdate.chargedCoins = 0;
    statusUpdate.listenerEarnedCoins = 0;
    statusUpdate.finalStatus = callStatus;
    statusUpdate.charged = true;
    statusUpdate.completedAt = completedAt;
    statusUpdate.finalized = true;
    if (!callData.callSid) statusUpdate.callSid = callSid;

    try {
      const sessionData = {
        callSid,
        listenerId: callData.listenerId || null,
        listenerName: callData.listenerName || null,
        listenerPhone: callData.listenerPhone || null,
        connected: false,
        durationSeconds: 0,
        chargedCoins: 0,
        finalStatus: callStatus,
        routingMode: callData.routingMode,
        callTransport: transport,
        endedDueToLowBalance: false,
        createdAt: callData.createdAt,
        completedAt,
      };
      await db.collection('users').doc(callData.callerUid).collection('sessions').add(sessionData);
    } catch (sessionErr) {
      console.error('[status-cb] Session save failed — callSid:', callSid, 'error:', sessionErr.message);
    }

    console.log('[status-cb] FINALIZED (0-duration) — callSid:', callSid, 'transport:', transport, 'status:', callStatus,
      'duration: 0, chargedCoins: 0, listenerCredited: 0');
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
