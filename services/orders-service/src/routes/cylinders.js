const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const CylinderController = require('../controllers/cylinderController');

const router = express.Router();

// Apply authentication and request ID to all routes
router.use(requestId);
router.use(authenticate);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));

    throw new ValidationError('Validation failed', validationErrors);
  }
  next();
};

// Get cylinders
router.get('/', [
  authorize(['supplier', 'delivery_driver', 'admin']),
  query('status')
    .optional()
    .isIn(['available', 'in_use', 'maintenance', 'returned', 'retired'])
    .withMessage('Invalid cylinder status'),
  handleValidationErrors,
  cache(300)
], asyncHandler(CylinderController.getCylinders));

// Get cylinder by ID or QR code
router.get('/:id', [
  authorize(['supplier', 'delivery_driver', 'household', 'admin']),
  cache(600)
], asyncHandler(CylinderController.getCylinderById));

// Create cylinder
router.post('/', [
  authorize(['supplier', 'admin']),
  body('qrCode')
    .trim()
    .notEmpty()
    .withMessage('QR code is required'),
  body('serialNumber')
    .trim()
    .notEmpty()
    .withMessage('Serial number is required'),
  body('gasTypeId')
    .isUUID()
    .withMessage('Valid gas type ID is required'),
  body('size')
    .trim()
    .notEmpty()
    .withMessage('Size is required'),
  body('supplierId')
    .isUUID()
    .withMessage('Valid supplier ID is required'),
  handleValidationErrors,
  invalidateCache('cylinders')
], asyncHandler(CylinderController.createCylinder));

// Update cylinder status
router.put('/:id/status', [
  authorize(['supplier', 'delivery_driver', 'admin']),
  body('status')
    .isIn(['available', 'in_use', 'maintenance', 'returned', 'retired'])
    .withMessage('Invalid cylinder status'),
  handleValidationErrors,
  invalidateCache('cylinders')
], asyncHandler(CylinderController.updateCylinderStatus));

module.exports = router;
