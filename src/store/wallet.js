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
  console.log('[DEBUG-WALLET-STORE] grantStarterCoins called for uid:', user.uid, 'phone:', user.phone);
  const userRef = walletRef(user);
  const starterTransactionRef = userRef.collection('transactions').doc('starter_bonus');
  const now = new Date();

  await db.runTransaction(async (txn) => {
    const doc = await txn.get(userRef);
    const data = doc.exists ? doc.data() : null;
    const hasCoins = typeof data?.coins === 'number';

    if (hasCoins) {
      console.log('[DEBUG-WALLET-STORE] User already has coins — skipping starter grant');
      return;
    }

    console.log('[DEBUG-WALLET-STORE] Creating NEW user doc with starter coins:', DEFAULT_STARTING_COINS);
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
  console.log('[DEBUG-WALLET-STORE] getWallet called for uid:', user.uid);
  const doc = await walletRef(user).get();
  if (!doc.exists) {
    console.log('[DEBUG-WALLET-STORE] No user doc found — granting starter coins');
    await grantStarterCoins(user);
    return buildResponse(DEFAULT_STARTING_COINS, user);
  }

  if (typeof doc.data().coins !== 'number') {
    console.log('[DEBUG-WALLET-STORE] User doc exists but no coins field — granting starter coins');
    await grantStarterCoins(user);
    return buildResponse(DEFAULT_STARTING_COINS, user);
  }

  const balance = doc.data().coins;
  console.log('[DEBUG-WALLET-STORE] Existing user — balance:', balance);
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
