const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { db } = require('../firebase-admin');

const router = Router();

router.post('/', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const amount = Number(req.body?.amount);
  const upiId = String(req.body?.upiId || '').trim();

  if (!Number.isFinite(amount) || amount < 1000) {
    return res.status(400).json({ error: 'Minimum withdrawal amount is 1000' });
  }
  if (!upiId) {
    return res.status(400).json({ error: 'UPI ID is required' });
  }

  // Fetch listener profile and validate
  const listenerRef = db.collection('ListenerProfiles').doc(user.uid);
  const listenerDoc = await listenerRef.get();

  if (!listenerDoc.exists) {
    return res.status(400).json({ error: 'Listener profile not found' });
  }

  const listener = listenerDoc.data();

  if (listener.status !== 'approved') {
    return res.status(400).json({ error: 'Listener profile is not approved' });
  }

  if ((listener.availableCoins || 0) < amount) {
    return res.status(400).json({ error: 'Insufficient coins for withdrawal' });
  }

  // Create withdrawal request and deduct coins
  const withdrawalDoc = {
    listenerId: user.uid,
    displayName: listener.displayName || null,
    upiId,
    amount,
    status: 'pending',
    createdAt: Date.now(),
  };

  const ref = await db.collection('withdrawalRequests').add(withdrawalDoc);
  await listenerRef.update({ availableCoins: (listener.availableCoins || 0) - amount });

  return res.json({ success: true, id: ref.id, ...withdrawalDoc });
});

router.get('/', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const snapshot = await db.collection('withdrawalRequests')
    .where('listenerId', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .get();

  const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return res.json({ success: true, requests });
});

router.get('/admin', async (req, res) => {
  const snapshot = await db.collection('withdrawalRequests')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .get();

  const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return res.json({ success: true, requests });
});

module.exports = router;
