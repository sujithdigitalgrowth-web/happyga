const { Router } = require('express');
const { resolveUserIdentity, toPositiveInteger } = require('../middleware/auth');
const { getWallet, setWalletBalance } = require('../store/wallet');
const { db } = require('../firebase-admin');

const router = Router();

router.get('/', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  return res.json(await getWallet(user));
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
