const { Router } = require('express');
const { resolveUserIdentity } = require('../middleware/auth');
const { getUserSessions, addSession, sanitizeSessionPayload } = require('../store/sessions');

const router = Router();

router.get('/', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  return res.json(await getUserSessions(user));
});

router.post('/', async (req, res) => {
  const user = await resolveUserIdentity(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const session = sanitizeSessionPayload(req.body);
  if (!session.name || !session.username) {
    return res.status(400).json({ error: 'name and username are required' });
  }

  await addSession(user, session);
  return res.status(201).json(session);
});

module.exports = router;
