const express = require('express');
const { query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache } = require('../middleware/cache');
const AnalyticsController = require('../controllers/analyticsController');

const router = express.Router();

// Apply authentication and request ID to all routes
router.use(requestId);
router.use(authenticate);
router.use(authorize('supplier')); // Only suppliers can access analytics

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
 * /api/v1/analytics/dashboard:
 *   get:
 *     summary: Get supplier dashboard analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly]
 *           default: monthly
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved successfully
 */
router.get('/dashboard', [
  query('period')
    .optional()
    .isIn(['7d', '30d', '90d', '1y'])
    .withMessage('Invalid period. Must be one of: 7d, 30d, 90d, 1y'),
  handleValidationErrors,
  cache(300) // Cache for 5 minutes
], asyncHandler(AnalyticsController.getDashboardOverview));

/**
 * @swagger
 * /api/v1/analytics/sales:
 *   get:
 *     summary: Get sales analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly]
 *           default: monthly
 *     responses:
 *       200:
 *         description: Sales analytics retrieved successfully
 */
router.get('/sales', [
  query('period')
    .optional()
    .isIn(['7d', '30d', '90d', '1y'])
    .withMessage('Invalid period. Must be one of: 7d, 30d, 90d, 1y'),
  handleValidationErrors,
  cache(300) // Cache for 5 minutes
], asyncHandler(AnalyticsController.getSalesAnalytics));

router.get('/inventory', [
  cache(600) // Cache for 10 minutes
], asyncHandler(AnalyticsController.getInventoryAnalytics));

module.exports = router;
