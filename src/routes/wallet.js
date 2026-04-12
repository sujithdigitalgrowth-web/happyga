const { Router } = require('express');
const { resolveUserIdentity, toPositiveInteger } = require('../middleware/auth');
const { getWallet, setWalletBalance } = require('../store/wallet');
const { db } = require('../firebase-admin');

const router = Router();

router.get('/', async (req, res) => {
  console.log('[DEBUG-WALLET] GET /api/wallet hit');
  const user = await resolveUserIdentity(req);
  if (!user) {
    console.warn('[DEBUG-WALLET] Auth failed — returning 401');
    return res.status(401).json({ error: 'Authentication required' });
  }
  console.log('[DEBUG-WALLET] Authenticated user:', JSON.stringify(user));
  try {
    const wallet = await getWallet(user);
    console.log('[DEBUG-WALLET] Wallet response:', JSON.stringify(wallet));
    return res.json(wallet);
  } catch (walletErr) {
    console.error('[DEBUG-WALLET] getWallet FAILED:', walletErr.message);
    return res.status(500).json({ error: 'Failed to load wallet' });
  }
});

router.post('/recharge', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const coins = toPositiveInteger(req.body?.coins);
  if (!coins) return res.status(400).json({ error: 'Positive coins value is required' });

  const price = toPositiveInteger(req.body?.price) || null;
  const wallet = await setWalletBalance(user, coins);

  // Save transaction record
  try {
    await db.collection('users').doc(user.uid).collection('transactions').add({
      type: 'recharge',
      coins,
      price,
      balanceAfter: wallet.balance,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('Failed to save transaction:', err.message);
  }

  return res.json({ ...wallet, addedCoins: coins, price });
});

router.get('/transactions', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const snapshot = await db.collection('users').doc(user.uid)
      .collection('transactions')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const transactions = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        type: d.type,
        coins: d.coins,
        price: d.price || null,
        balanceAfter: d.balanceAfter,
        createdAt: d.createdAt?.toDate?.() || d.createdAt,
      };
    });

    return res.json({ success: true, transactions });
  } catch (err) {
    console.error('Failed to fetch transactions:', err.message);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
