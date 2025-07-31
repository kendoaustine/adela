const express = require('express');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requestId);

// Supplier verification routes
router.post('/documents', [
  authenticate,
  authorize('supplier'),
], asyncHandler(async (req, res) => {
  res.json({ message: 'Upload supplier documents - to be implemented' });
}));

router.get('/verification-status', [
  authenticate,
  authorize('supplier'),
], asyncHandler(async (req, res) => {
  res.json({ message: 'Get verification status - to be implemented' });
}));

module.exports = router;
