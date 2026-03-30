const { auth } = require('../firebase-admin');

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `+91${digits.slice(-10)}`;
}

function toPositiveInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

async function resolveUserIdentity(req) {
  // Try Firebase ID token first (Authorization: Bearer <token>)
  const authHeader = req.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && auth) {
    const idToken = authHeader.slice(7);
    try {
      const decoded = await auth.verifyIdToken(idToken);
      const phone = decoded.phone_number ||
        normalizePhone(req.get('x-happyga-phone') || req.body?.phone || req.query.phone);
      return { uid: decoded.uid, phone, authMode: 'firebase' };
    } catch {
      return null;
    }
  }
  // Fallback: phone header (demo / legacy mode)
  const phone = normalizePhone(
    req.get('x-happyga-phone') || req.body?.phone || req.query.phone,
  );
  if (!phone) return null;
  return { uid: phone, phone, authMode: 'demo' };
}

module.exports = { normalizePhone, toPositiveInteger, resolveUserIdentity };
