const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const InventoryController = require('../controllers/inventoryController');
const reorderAlertService = require('../services/reorderAlerts');
const { query } = require('../database/connection');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication and request ID to all routes
router.use(requestId);
router.use(authenticate);
router.use(authorize('supplier')); // Only suppliers can access inventory

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
 * /api/v1/inventory:
 *   get:
 *     summary: Get supplier inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: gasType
 *         schema:
 *           type: string
 *       - in: query
 *         name: lowStock
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Inventory retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', [
  query('gasType')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Gas type filter must not be empty'),
  query('lowStock')
    .optional()
    .isBoolean()
    .withMessage('Low stock filter must be boolean'),
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
], asyncHandler(InventoryController.getInventory));

/**
 * @swagger
 * /api/v1/inventory:
 *   post:
 *     summary: Add inventory item
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - gasTypeId
 *               - cylinderSize
 *               - quantityAvailable
 *               - reorderLevel
 *               - unitCost
 *             properties:
 *               gasTypeId:
 *                 type: string
 *                 format: uuid
 *               cylinderSize:
 *                 type: string
 *               quantityAvailable:
 *                 type: integer
 *                 minimum: 0
 *               reorderLevel:
 *                 type: integer
 *                 minimum: 1
 *               unitCost:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Inventory item added successfully
 *       400:
 *         description: Validation error
 */
router.post('/', [
  body('gasTypeId').isUUID().withMessage('Valid gas type ID is required'),
  body('cylinderSize').trim().notEmpty().withMessage('Cylinder size is required'),
  body('quantityAvailable').isInt({ min: 0 }).withMessage('Quantity must be non-negative'),
  body('reorderLevel').isInt({ min: 1 }).withMessage('Reorder level must be at least 1'),
  body('unitCost').isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  handleValidationErrors,
  invalidateCache('inventory')
], asyncHandler(InventoryController.addInventoryItem));

/**
 * @swagger
 * /api/v1/inventory/{id}:
 *   put:
 *     summary: Update inventory item
 *     tags: [Inventory]
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
 *             properties:
 *               quantityAvailable:
 *                 type: integer
 *                 minimum: 0
 *               reorderLevel:
 *                 type: integer
 *                 minimum: 1
 *               unitCost:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *       404:
 *         description: Inventory item not found
 */
router.put('/:id', [
  body('quantityAvailable')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Quantity must be non-negative'),
  body('reorderLevel')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Reorder level must be at least 1'),
  body('unitCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be non-negative'),
  handleValidationErrors,
  invalidateCache('inventory')
], asyncHandler(InventoryController.updateInventoryItem));

/**
 * @swagger
 * /api/v1/inventory/{id}/restock:
 *   post:
 *     summary: Restock inventory item
 *     tags: [Inventory]
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
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Inventory restocked successfully
 *       404:
 *         description: Inventory item not found
 */
router.post('/:id/restock', [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
  body('unitCost').optional().isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  handleValidationErrors,
  invalidateCache('inventory')
], asyncHandler(InventoryController.restockInventory));

/**
 * @swagger
 * /api/v1/inventory/low-stock:
 *   get:
 *     summary: Get low stock items
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Low stock items retrieved successfully
 */
router.get('/low-stock', [
  cache(120)
], asyncHandler(InventoryController.getLowStockItems));

/**
 * @swagger
 * /api/v1/inventory/available:
 *   get:
 *     summary: Get available suppliers for specific inventory requirements
 *     tags: [Inventory]
 *     parameters:
 *       - in: query
 *         name: gasTypeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: cylinderSize
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: minQuantity
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxDistance
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *     responses:
 *       200:
 *         description: Available suppliers retrieved successfully
 */
router.get('/available', [
  query('gasTypeId')
    .isUUID()
    .withMessage('Valid gas type ID is required'),
  query('cylinderSize')
    .trim()
    .notEmpty()
    .withMessage('Cylinder size is required'),
  query('minQuantity')
    .isInt({ min: 1 })
    .withMessage('Minimum quantity must be at least 1'),
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('maxDistance')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Max distance must be between 1 and 200 km'),
  handleValidationErrors,
  cache(120) // Cache for 2 minutes (inventory changes frequently)
], asyncHandler(InventoryController.getAvailableSuppliers));

/**
 * @swagger
 * /api/v1/inventory/reserve:
 *   post:
 *     summary: Reserve inventory for an order
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - items
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     supplierId:
 *                       type: string
 *                       format: uuid
 *                     gasTypeId:
 *                       type: string
 *                       format: uuid
 *                     cylinderSize:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *               reservationDuration:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 120
 *                 default: 30
 *     responses:
 *       200:
 *         description: Inventory reserved successfully
 *       400:
 *         description: Insufficient inventory or validation error
 */
router.post('/reserve', [
  body('orderId').isUUID().withMessage('Valid order ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.supplierId').isUUID().withMessage('Valid supplier ID is required'),
  body('items.*.gasTypeId').isUUID().withMessage('Valid gas type ID is required'),
  body('items.*.cylinderSize').trim().notEmpty().withMessage('Cylinder size is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('reservationDuration').optional().isInt({ min: 5, max: 120 }).withMessage('Reservation duration must be between 5 and 120 minutes'),
  handleValidationErrors,
  invalidateCache('inventory')
], asyncHandler(InventoryController.reserveInventory));

/**
 * @swagger
 * /api/v1/inventory/reservations/{id}/release:
 *   post:
 *     summary: Release inventory reservation
 *     tags: [Inventory]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Reservation released successfully
 *       404:
 *         description: Reservation not found
 */
router.post('/reservations/:id/release', [
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be less than 500 characters'),
  handleValidationErrors,
  invalidateCache('inventory')
], asyncHandler(InventoryController.releaseReservation));

/**
 * @swagger
 * /api/v1/inventory/reorder-alerts/check:
 *   post:
 *     summary: Manually trigger reorder alert check
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reorder alert check completed
 */
router.post('/reorder-alerts/check', [
  authorize(['supplier', 'platform_admin']),
  invalidateCache('inventory')
], asyncHandler(async (req, res) => {
  try {
    const result = await reorderAlertService.checkAndSendReorderAlerts();

    res.json({
      message: 'Reorder alert check completed',
      ...result
    });
  } catch (error) {
    logger.error('Failed to check reorder alerts:', error);
    throw error;
  }
}));

/**
 * @swagger
 * /api/v1/inventory/metrics:
 *   get:
 *     summary: Get inventory metrics for supplier
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory metrics retrieved successfully
 */
router.get('/metrics', [
  cache(300) // Cache for 5 minutes
], asyncHandler(async (req, res) => {
  try {
    const supplierId = req.user.id;

    const metricsResult = await query(
      'SELECT * FROM calculate_inventory_metrics($1)',
      [supplierId]
    );

    const metrics = metricsResult.rows[0];

    res.json({
      message: 'Inventory metrics retrieved successfully',
      metrics: {
        totalItems: parseInt(metrics.total_items),
        lowStockItems: parseInt(metrics.low_stock_items),
        criticalItems: parseInt(metrics.critical_items),
        totalValue: parseFloat(metrics.total_value),
        reservedQuantity: parseInt(metrics.reserved_quantity),
        stockHealthScore: metrics.total_items > 0 ?
          Math.round(((metrics.total_items - metrics.low_stock_items) / metrics.total_items) * 100) : 100
      }
    });
  } catch (error) {
    logger.error('Failed to get inventory metrics:', {
      error: error.message,
      supplierId: req.user.id
    });
    throw error;
  }
}));

module.exports = router;
