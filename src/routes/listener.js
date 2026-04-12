const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { db, FieldValue } = require('../firebase-admin');

const router = Router();

router.post('/listener-profile', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) {
    console.error('[listener-profile] Auth failed — no user resolved');
    return res.status(401).json({ error: 'Authentication required' });
  }

  console.log('[listener-profile] Request from uid:', user.uid, 'phone:', user.phone);
  console.log('[listener-profile] Body:', JSON.stringify(req.body));

  const displayName = String(req.body?.displayName || '').trim();
  const phoneNumber = String(req.body?.phoneNumber || '').trim();
  const normalizedPhone = phoneNumber.replace(/\D/g, '');

  if (!displayName || normalizedPhone.length < 10) {
    return res.status(400).json({ error: 'displayName and a valid phoneNumber are required' });
  }

  // Auto-assign a random profile avatar (1-8)
  const avatarIndex = Math.floor(Math.random() * 8) + 1;
  const avatar = `profile-assets/listener-${avatarIndex}.png`;

  try {
    const now = new Date();
    const docRef = db.collection('listenerProfiles').doc(user.uid);
    const existingDoc = await docRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : null;
    const data = {
      uid: user.uid,
      phone: phoneNumber || user.phone || null,
      displayName,
      avatar: existingData?.avatar || avatar,
      status: String(existingData?.status || '').toLowerCase() === 'approved' ? 'approved' : 'pending',
      availableCoins: Number(existingData?.availableCoins || 0),
      totalCoinsEarned: Number(existingData?.totalCoinsEarned || 0),
      isOnline: false,
      createdAt: existingData?.createdAt || now,
      updatedAt: now,
    };

    // Firestore set can hang due to gRPC issues — race with a timeout
    await Promise.race([
      docRef.set(data, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timed out')), 8000)),
    ]);

    return res.json({ success: true, status: data.status });
  } catch (err) {
    console.error('[listener-profile] Firestore write FAILED:', err.message);
    console.error('[listener-profile] Error details:', err.code, err.details || '');
    return res.status(500).json({ error: 'Failed to save listener profile' });
  }
});

router.get('/listener-profile', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const doc = await db.collection('listenerProfiles').doc(user.uid).get();
    if (!doc.exists) {
      return res.json({ success: true, profile: null });
    }
    return res.json({ success: true, profile: doc.data() });
  } catch (err) {
    console.error('Firestore read error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch listener profile' });
  }
});

router.post('/listener-status', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  const uid = user.uid;

  const { isOnline } = req.body;

  try {
    await db.collection('listenerProfiles').doc(uid).update({
      isOnline: isOnline,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Failed to update listener status:', err.message);
    return res.status(500).json({ error: 'Failed to update listener status' });
  }
});

// ── App-call presence sync ──
const VALID_APP_STATUSES = new Set(['ready', 'busy', 'offline', 'unregistered']);

router.post('/listener-app-presence', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const status = String(req.body?.status || '').toLowerCase();
  if (!VALID_APP_STATUSES.has(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_APP_STATUSES].join(', ')}` });
  }

  try {
    const docRef = db.collection('listenerProfiles').doc(user.uid);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().status !== 'approved') {
      return res.json({ success: false, reason: 'not_approved' });
    }

    await docRef.update({
      appCallStatus: status,
      appCallReady: status === 'ready',
      appCallLastSeenAt: FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, appCallStatus: status });
  } catch (err) {
    console.error('Failed to update app-call presence:', err.message);
    return res.status(500).json({ error: 'Failed to update app-call presence' });
  }
});

router.get('/listeners', async (_req, res) => {
  try {
    // Fetch all listener profiles and filter for approved status (case-insensitive)
    // to handle both 'approved' and 'Approved' written by admin console or code.
    const snapshot = await db.collection('listenerProfiles').get();

    const listeners = snapshot.docs
      .filter((doc) => String(doc.data().status || '').toLowerCase() === 'approved')
      .map((doc) => ({ id: doc.id, ...doc.data() }));

    return res.json({
      success: true,
      listeners,
    });
  } catch (err) {
    console.error('Failed to fetch listeners:', err.message);
    return res.status(500).json({ error: 'Failed to fetch listeners' });
  }
});

router.get('/listener-sessions', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const snapshot = await db.collection('listenerProfiles').doc(user.uid)
      .collection('sessions')
      .orderBy('completedAt', 'desc')
      .limit(20)
      .get();

    const sessions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, sessions });
  } catch (err) {
    console.error('Failed to fetch listener sessions:', err.message);
    return res.status(500).json({ error: 'Failed to fetch listener sessions' });
  }
});

module.exports = router;
