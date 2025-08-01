const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const InventoryController = require('../controllers/inventoryController');

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
], asyncHandler(async (req, res) => {
  // TODO: Implement restock logic
  res.json({ message: 'Restock inventory - to be implemented' });
}));

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

module.exports = router;
