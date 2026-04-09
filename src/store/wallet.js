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

async function grantStarterCoins(user) {
  const userRef = walletRef(user);
  const starterTransactionRef = userRef.collection('transactions').doc('starter_bonus');
  const now = new Date();

  await db.runTransaction(async (txn) => {
    const doc = await txn.get(userRef);
    const data = doc.exists ? doc.data() : null;
    const hasCoins = typeof data?.coins === 'number';

    if (hasCoins) {
      return;
    }

    txn.set(userRef, {
      phone: user.phone,
      coins: DEFAULT_STARTING_COINS,
      createdAt: data?.createdAt || now,
      updatedAt: now,
      starterCoinsGrantedAt: now,
    }, { merge: true });

    txn.set(starterTransactionRef, {
      type: 'starter-bonus',
      coins: DEFAULT_STARTING_COINS,
      price: null,
      balanceAfter: DEFAULT_STARTING_COINS,
      createdAt: now,
    }, { merge: true });
  });
}

async function getWallet(user) {
  const doc = await walletRef(user).get();
  if (!doc.exists) {
    await grantStarterCoins(user);
    return buildResponse(DEFAULT_STARTING_COINS, user);
  }

  if (typeof doc.data().coins !== 'number') {
    await grantStarterCoins(user);
    return buildResponse(DEFAULT_STARTING_COINS, user);
  }

  const balance = doc.data().coins;
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
