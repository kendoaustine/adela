const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const PricingController = require('../controllers/pricingController');

const router = express.Router();

// Apply authentication and request ID to all routes
router.use(requestId);
router.use(authenticate);
router.use(authorize('supplier')); // Only suppliers can manage pricing

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
 * /api/v1/pricing:
 *   get:
 *     summary: Get supplier pricing
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: gasType
 *         schema:
 *           type: string
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Pricing retrieved successfully
 */
router.get('/', [
  query('gasType')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Gas type filter must not be empty'),
  query('customerType')
    .optional()
    .isIn(['retail', 'wholesale', 'bulk', 'emergency', 'household'])
    .withMessage('Invalid customer type'),
  query('cylinderSize')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Cylinder size filter must not be empty'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive filter must be boolean'),
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
], asyncHandler(PricingController.getPricing));

/**
 * @swagger
 * /api/v1/pricing:
 *   post:
 *     summary: Create pricing rule
 *     tags: [Pricing]
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
 *               - basePrice
 *             properties:
 *               gasTypeId:
 *                 type: string
 *                 format: uuid
 *               cylinderSize:
 *                 type: string
 *               basePrice:
 *                 type: number
 *                 minimum: 0
 *               promotionalPrice:
 *                 type: number
 *                 minimum: 0
 *               bulkDiscountThreshold:
 *                 type: integer
 *                 minimum: 1
 *               bulkDiscountPercentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 50
 *               emergencySurchargePercentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               deliveryFee:
 *                 type: number
 *                 minimum: 0
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Pricing rule created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', [
  body('gasTypeId').isUUID().withMessage('Valid gas type ID is required'),
  body('cylinderSize').trim().notEmpty().withMessage('Cylinder size is required'),
  body('customerType')
    .isIn(['retail', 'wholesale', 'bulk', 'emergency', 'household'])
    .withMessage('Invalid customer type'),
  body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be non-negative'),
  body('minQuantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Min quantity must be at least 1'),
  body('maxQuantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max quantity must be at least 1'),
  body('discountPercentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount must be between 0 and 100'),
  body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from date must be in ISO format'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be in ISO format'),
  body('priority')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Priority must be at least 1'),
  handleValidationErrors,
  invalidateCache('pricing')
], asyncHandler(PricingController.createPricingRule));

/**
 * @swagger
 * /api/v1/pricing/{id}:
 *   put:
 *     summary: Update pricing rule
 *     tags: [Pricing]
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
 *         description: Pricing updated successfully
 *       404:
 *         description: Pricing rule not found
 */
router.put('/:id', [
  body('basePrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Base price must be non-negative'),
  body('minQuantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Min quantity must be at least 1'),
  body('maxQuantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max quantity must be at least 1'),
  body('discountPercentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount must be between 0 and 100'),
  body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from date must be in ISO format'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until date must be in ISO format'),
  body('priority')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Priority must be at least 1'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  handleValidationErrors,
  invalidateCache('pricing')
], asyncHandler(PricingController.updatePricingRule));

/**
 * @swagger
 * /api/v1/pricing/{id}/activate:
 *   post:
 *     summary: Activate pricing rule
 *     tags: [Pricing]
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
 *         description: Pricing rule activated successfully
 */
// Delete pricing rule
router.delete('/:id', [
  invalidateCache('pricing')
], asyncHandler(PricingController.deletePricingRule));

// Calculate price for items
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
  body('customerType')
    .optional()
    .isIn(['retail', 'wholesale', 'bulk', 'emergency', 'household'])
    .withMessage('Invalid customer type'),
  handleValidationErrors
], asyncHandler(PricingController.calculatePrice));

// Get bulk pricing options
router.get('/bulk', [
  query('gasTypeId')
    .isUUID()
    .withMessage('Valid gas type ID is required'),
  query('cylinderSize')
    .trim()
    .notEmpty()
    .withMessage('Cylinder size is required'),
  query('customerType')
    .optional()
    .isIn(['retail', 'wholesale', 'bulk', 'emergency', 'household'])
    .withMessage('Invalid customer type'),
  handleValidationErrors,
  cache(600) // Cache for 10 minutes
], asyncHandler(PricingController.getBulkPricing));

module.exports = router;
