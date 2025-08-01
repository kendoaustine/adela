const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const BundleController = require('../controllers/bundleController');

const router = express.Router();

// Apply authentication and request ID to all routes
router.use(requestId);
router.use(authenticate);
router.use(authorize('supplier')); // Only suppliers can manage bundles

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
 * /api/v1/bundles:
 *   get:
 *     summary: Get promotional bundles
 *     tags: [Bundles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: targetRole
 *         schema:
 *           type: string
 *           enum: [hospital, artisan, household]
 *     responses:
 *       200:
 *         description: Bundles retrieved successfully
 */
router.get('/', [
  query('bundleType')
    .optional()
    .isIn(['discount', 'bulk', 'seasonal', 'loyalty'])
    .withMessage('Invalid bundle type'),
  query('targetAudience')
    .optional()
    .isIn(['all', 'new_customers', 'returning_customers', 'vip_customers'])
    .withMessage('Invalid target audience'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
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
], asyncHandler(BundleController.getBundles));

/**
 * @swagger
 * /api/v1/bundles:
 *   post:
 *     summary: Create promotional bundle
 *     tags: [Bundles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - bundleItems
 *               - originalPrice
 *               - bundlePrice
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               bundleItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     gasTypeId:
 *                       type: string
 *                       format: uuid
 *                     cylinderSize:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *               originalPrice:
 *                 type: number
 *                 minimum: 0
 *               bundlePrice:
 *                 type: number
 *                 minimum: 0
 *               maxRedemptions:
 *                 type: integer
 *                 minimum: 1
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *               targetUserRoles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [hospital, artisan, household]
 *     responses:
 *       201:
 *         description: Bundle created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name is required and must be less than 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('bundleType')
    .optional()
    .isIn(['discount', 'bulk', 'seasonal', 'loyalty'])
    .withMessage('Invalid bundle type'),
  body('discountType')
    .optional()
    .isIn(['percentage', 'fixed_amount', 'buy_x_get_y'])
    .withMessage('Invalid discount type'),
  body('discountValue')
    .isFloat({ min: 0 })
    .withMessage('Discount value must be non-negative'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items array is required and must contain at least one item'),
  body('items.*.gasTypeId')
    .isUUID()
    .withMessage('Valid gas type ID is required for each item'),
  body('items.*.cylinderSize')
    .trim()
    .notEmpty()
    .withMessage('Cylinder size is required for each item'),
  handleValidationErrors,
  invalidateCache('bundles')
], asyncHandler(BundleController.createBundle));

/**
 * @swagger
 * /api/v1/bundles/{id}:
 *   get:
 *     summary: Get bundle by ID
 *     tags: [Bundles]
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
 *         description: Bundle retrieved successfully
 *       404:
 *         description: Bundle not found
 */
// Update bundle
router.put('/:id', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be less than 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('discountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be non-negative'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  handleValidationErrors,
  invalidateCache('bundles')
], asyncHandler(BundleController.updateBundle));

// Delete bundle
router.delete('/:id', [
  invalidateCache('bundles')
], asyncHandler(BundleController.deleteBundle));

// Calculate bundle discount
router.post('/calculate', [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items array is required'),
  body('items.*.gasTypeId')
    .isUUID()
    .withMessage('Valid gas type ID is required for each item'),
  body('items.*.cylinderSize')
    .trim()
    .notEmpty()
    .withMessage('Cylinder size is required for each item'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1 for each item'),
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative for each item'),
  body('customerId')
    .optional()
    .isUUID()
    .withMessage('Valid customer ID is required'),
  body('customerType')
    .optional()
    .isIn(['new_customers', 'returning_customers', 'vip_customers'])
    .withMessage('Invalid customer type'),
  handleValidationErrors
], asyncHandler(BundleController.calculateBundleDiscount));

// Get bundle usage statistics
router.get('/usage/statistics', [
  query('bundleId')
    .optional()
    .isUUID()
    .withMessage('Valid bundle ID is required'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in ISO format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in ISO format'),
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
], asyncHandler(BundleController.getBundleUsage));

module.exports = router;
