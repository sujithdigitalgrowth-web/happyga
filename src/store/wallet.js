const { db } = require('../firebase-admin');
const { DEFAULT_STARTING_COINS } = require('../config');

function walletRef(user) {
  return db.collection('users').doc(user.uid);
}

function buildResponse(balance, user) {
  return {
    balance,
    currency: 'coins',
    authMode: user.authMode,
    storage: 'firestore',
    billing: {
      model: 'duration-based',
      minimumCoinsToStart: 1,
      coinPerSeconds: 10,
    },
  };
}

async function getWallet(user) {
  const doc = await walletRef(user).get();
  if (!doc.exists) {
    await walletRef(user).set({ phone: user.phone, coins: DEFAULT_STARTING_COINS, createdAt: new Date() });
    return buildResponse(DEFAULT_STARTING_COINS, user);
  }
  const balance = doc.data().coins ?? DEFAULT_STARTING_COINS;
  return buildResponse(balance, user);
}

async function setWalletBalance(user, delta) {
  const ref = walletRef(user);
  let newBalance;
  await db.runTransaction(async (txn) => {
    const doc = await txn.get(ref);
    const current = doc.exists ? (doc.data().coins ?? DEFAULT_STARTING_COINS) : DEFAULT_STARTING_COINS;
    newBalance = Math.max(0, current + delta);
    txn.set(ref, { phone: user.phone, coins: newBalance, updatedAt: new Date() }, { merge: true });
  });
  return buildResponse(newBalance, user);
}

module.exports = { getWallet, setWalletBalance };
