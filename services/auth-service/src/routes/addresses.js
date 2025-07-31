const express = require('express');
const { authenticate, requestId } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requestId);

// Address management routes
router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json({ message: 'Get addresses - to be implemented' });
}));

router.post('/', authenticate, asyncHandler(async (req, res) => {
  res.json({ message: 'Create address - to be implemented' });
}));

module.exports = router;
