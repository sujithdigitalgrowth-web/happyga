const admin = require('firebase-admin');

if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else {
    // eslint-disable-next-line global-require
    credential = admin.credential.cert(require('../serviceAccountKey.json'));
  }
  admin.initializeApp({ credential });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
