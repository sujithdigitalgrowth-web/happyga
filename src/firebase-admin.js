const admin = require('firebase-admin');

if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } catch (e) {
      console.error('[firebase-admin] Invalid FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    }
  } else {
    try {
      // eslint-disable-next-line global-require
      credential = admin.credential.cert(require('../serviceAccountKey.json'));
    } catch {
      console.warn('[firebase-admin] serviceAccountKey.json not found and FIREBASE_SERVICE_ACCOUNT env var not set. Firebase features will be unavailable.');
    }
  }
  if (credential) {
    admin.initializeApp({ credential });
  }
}

const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = admin.apps.length ? getFirestore(admin.app(), 'happygadatabase') : null;
const auth = admin.apps.length ? admin.auth() : null;

module.exports = { admin, db, auth, FieldValue };
