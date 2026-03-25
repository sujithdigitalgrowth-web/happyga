const { Router } = require('express');
const { callByNumber, callByUsername } = require('../controllers/calls.controller');

const router = Router();

// POST /api/call            — raw number in body { toNumber }
router.post('/', callByNumber);

// POST /api/call/:username  — auto-looks up user's registered phone
router.post('/:username', callByUsername);

module.exports = router;
