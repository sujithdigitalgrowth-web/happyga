const { Router } = require('express');
const { resolveUserIdentity, toPositiveInteger } = require('../middleware/auth');
const { getWallet, setWalletBalance } = require('../store/wallet');

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

  const wallet = await setWalletBalance(user, coins);
  return res.json({ ...wallet, addedCoins: coins, price: toPositiveInteger(req.body?.price) || null });
});

module.exports = router;
