const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const OrdersController = require('../controllers/ordersController');

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

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - supplierId
 *               - deliveryAddressId
 *               - items
 *             properties:
 *               supplierId:
 *                 type: string
 *                 format: uuid
 *               deliveryAddressId:
 *                 type: string
 *                 format: uuid
 *               orderType:
 *                 type: string
 *                 enum: [regular, emergency_sos, recurring]
 *                 default: regular
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     gasTypeId:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                     unitPrice:
 *                       type: number
 *                       minimum: 0
 *                     cylinderSize:
 *                       type: string
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', [
  authorize(['household', 'supplier']), // Both households and suppliers can create orders
  body('supplierId').isUUID().withMessage('Valid supplier ID is required'),
  body('deliveryAddressId').isUUID().withMessage('Valid delivery address ID is required'),
  body('orderType')
    .optional()
    .isIn(['regular', 'emergency_sos', 'recurring'])
    .withMessage('Invalid order type'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.gasTypeId').isUUID().withMessage('Valid gas type ID is required'),
  body('items.*.cylinderSize').trim().notEmpty().withMessage('Cylinder size is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('specialInstructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Special instructions must be 500 characters or less'),
  body('emergencyContactPhone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid emergency contact phone is required'),
  body('scheduledDeliveryDate')
    .optional()
    .isISO8601()
    .withMessage('Valid scheduled delivery date is required'),
  handleValidationErrors,
  invalidateCache('orders')
], asyncHandler(OrdersController.createOrder));

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: Get user's orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, preparing, out_for_delivery, delivered, cancelled]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/', [
  authorize(['household', 'supplier', 'delivery_driver']),
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'])
    .withMessage('Invalid status filter'),
  query('orderType')
    .optional()
    .isIn(['regular', 'emergency_sos', 'recurring'])
    .withMessage('Invalid order type filter'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be 0 or greater'),
  handleValidationErrors,
  cache(300) // Cache for 5 minutes
], asyncHandler(OrdersController.getUserOrders));

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:id', [
  authorize(['household', 'supplier', 'delivery_driver']),
  cache(180) // Cache for 3 minutes
], asyncHandler(OrdersController.getOrderById));

/**
 * @swagger
 * /api/v1/orders/{id}/cancel:
 *   post:
 *     summary: Cancel an order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Cannot cancel order in current status
 *       404:
 *         description: Order not found
 */
router.post('/:id/cancel', [
  authorize(['household', 'supplier']), // Only order creators can cancel
  body('reason').trim().isLength({ min: 1, max: 500 }).withMessage('Cancellation reason is required'),
  handleValidationErrors,
  invalidateCache('orders')
], asyncHandler(OrdersController.cancelOrder));

module.exports = router;
