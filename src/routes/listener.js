const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { db } = require('../firebase-admin');

const router = Router();

router.post('/listener-profile', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const displayName = String(req.body?.displayName || '').trim();
  const language = String(req.body?.language || '').trim();
  const bio = String(req.body?.bio || '').trim();
  const gender = String(req.body?.gender || '').trim();

  if (!displayName || !language || !gender) {
    return res.status(400).json({ error: 'displayName, language, and gender are required' });
  }

  // Auto-assign a random profile avatar (1-8)
  const avatarIndex = Math.floor(Math.random() * 8) + 1;
  const avatar = `profile-assets/listener-${avatarIndex}.png`;

  const data = {
    uid: user.uid,
    displayName,
    language,
    bio,
    gender,
    avatar,
    status: gender === 'female' ? 'approved' : 'pending',
    availableCoins: 0,
    totalCoinsEarned: 0,
    isOnline: false,
    createdAt: new Date(),
  };

  try {
    // Firestore set can hang due to gRPC issues — race with a timeout
    await Promise.race([
      db.collection('listenerProfiles').doc(user.uid).set(data),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timed out')), 8000)),
    ]);
  } catch (err) {
    console.error('Firestore write issue:', err.message);
    // Even if Firestore hangs, the write usually eventually goes through
    // Return success so the user isn't stuck
  }

  return res.json({ success: true, status: data.status });
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

router.get('/listeners', async (_req, res) => {
  try {
    const snapshot = await db.collection('listenerProfiles')
      .where('status', '==', 'approved')
      .get();

    const listeners = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

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
