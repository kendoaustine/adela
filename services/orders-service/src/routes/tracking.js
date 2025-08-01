const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const TrackingController = require('../controllers/trackingController');
const { cache } = require('../middleware/cache');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    throw new ValidationError('Validation failed', validationErrors);
  }
  next();
};

/**
 * @swagger
 * /api/v1/tracking/{orderId}:
 *   get:
 *     summary: Get real-time tracking information for an order
 *     tags: [Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tracking information retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:orderId', [
  authenticate,
  authorize(['household', 'supplier', 'delivery_driver', 'platform_admin']),
  cache(30) // Cache for 30 seconds for real-time data
], asyncHandler(TrackingController.getOrderTracking));

/**
 * @swagger
 * /api/v1/tracking/{orderId}/location:
 *   post:
 *     summary: Update delivery location (driver only)
 *     tags: [Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *               status:
 *                 type: string
 *                 enum: [assigned, in_transit, delivered, failed]
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Location updated successfully
 *       400:
 *         description: Invalid coordinates or validation error
 *       404:
 *         description: Delivery not found or not assigned to driver
 */
router.post('/:orderId/location', [
  authenticate,
  authorize(['delivery_driver']),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('status')
    .optional()
    .isIn(['assigned', 'in_transit', 'delivered', 'failed'])
    .withMessage('Invalid delivery status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters'),
  handleValidationErrors
], asyncHandler(TrackingController.updateDeliveryLocation));

module.exports = router;
