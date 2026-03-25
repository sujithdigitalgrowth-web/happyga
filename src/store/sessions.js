const { db } = require('../firebase-admin');

function sessionsCol(user) {
  return db.collection('users').doc(user.uid).collection('sessions');
}

function sanitizeSessionPayload(payload) {
  return {
    name:     String(payload?.name     || '').trim().slice(0, 60),
    username: String(payload?.username || '').trim().slice(0, 40),
    duration: String(payload?.duration || '01m 00s').trim().slice(0, 20),
    when:     String(payload?.when     || '').trim().slice(0, 40),
  };
}

async function getUserSessions(user) {
  const snapshot = await sessionsCol(user)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snapshot.docs.map((d) => {
    const { createdAt, ...rest } = d.data();
    return rest;
  });
}

async function addSession(user, session) {
  await sessionsCol(user).add({ ...session, createdAt: new Date() });
}

module.exports = { getUserSessions, addSession, sanitizeSessionPayload };
