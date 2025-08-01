const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const DeliveryController = require('../controllers/deliveryController');

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

// Get all deliveries
router.get('/', [
  authorize(['delivery_driver', 'supplier', 'admin']),
  query('status')
    .optional()
    .isIn(['assigned', 'in_transit', 'delivered', 'failed'])
    .withMessage('Invalid delivery status'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be 0 or greater'),
  handleValidationErrors,
  cache(300)
], asyncHandler(DeliveryController.getDeliveries));

// Assign delivery to driver
router.post('/orders/:orderId/assign', [
  authorize(['supplier', 'admin']),
  body('driverId')
    .isUUID()
    .withMessage('Valid driver ID is required'),
  body('scheduledDate')
    .optional()
    .isISO8601()
    .withMessage('Valid scheduled date is required'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  handleValidationErrors,
  invalidateCache('deliveries')
], asyncHandler(DeliveryController.assignDelivery));

// Update delivery status
router.put('/:id/status', [
  authorize(['delivery_driver', 'admin']),
  body('status')
    .isIn(['assigned', 'in_transit', 'delivered', 'failed'])
    .withMessage('Invalid delivery status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  handleValidationErrors,
  invalidateCache('deliveries')
], asyncHandler(DeliveryController.updateDeliveryStatus));

// Get delivery tracking
router.get('/:id/tracking', [
  authorize(['household', 'delivery_driver', 'supplier', 'admin']),
  cache(60) // Cache for 1 minute
], asyncHandler(DeliveryController.getDeliveryTracking));

module.exports = router;
