const express = require('express');
const { authenticate, requestId } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requestId);

// Profile management routes
router.get('/', authenticate, asyncHandler(async (req, res) => {
  res.json({ message: 'Get profile - to be implemented' });
}));

router.put('/', authenticate, asyncHandler(async (req, res) => {
  res.json({ message: 'Update profile - to be implemented' });
}));

module.exports = router;
