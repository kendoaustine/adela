const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Real-time tracking routes
router.get('/:orderId', asyncHandler(async (req, res) => {
  res.json({ message: 'Get real-time tracking - to be implemented' });
}));

router.post('/:orderId/location', asyncHandler(async (req, res) => {
  res.json({ message: 'Update delivery location - to be implemented' });
}));

module.exports = router;
