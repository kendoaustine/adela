const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

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
router.get('/', asyncHandler(async (req, res) => {
  // TODO: Implement get bundles logic
  res.json({ message: 'Get bundles - to be implemented' });
}));

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
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Bundle name is required and must be less than 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('bundleItems').isArray({ min: 1 }).withMessage('At least one bundle item is required'),
  body('bundleItems.*.gasTypeId').isUUID().withMessage('Valid gas type ID is required'),
  body('bundleItems.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('originalPrice').isFloat({ min: 0 }).withMessage('Original price must be non-negative'),
  body('bundlePrice').isFloat({ min: 0 }).withMessage('Bundle price must be non-negative'),
  body('maxRedemptions').optional().isInt({ min: 1 }).withMessage('Max redemptions must be at least 1'),
  body('validUntil').optional().isISO8601().withMessage('Valid until must be a valid date'),
  body('targetUserRoles').optional().isArray().withMessage('Target user roles must be an array'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // TODO: Implement create bundle logic
  res.status(201).json({ message: 'Create bundle - to be implemented' });
}));

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
router.get('/:id', asyncHandler(async (req, res) => {
  // TODO: Implement get bundle by ID logic
  res.json({ message: 'Get bundle by ID - to be implemented' });
}));

/**
 * @swagger
 * /api/v1/bundles/{id}:
 *   put:
 *     summary: Update bundle
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
 *         description: Bundle updated successfully
 *       404:
 *         description: Bundle not found
 */
router.put('/:id', asyncHandler(async (req, res) => {
  // TODO: Implement update bundle logic
  res.json({ message: 'Update bundle - to be implemented' });
}));

/**
 * @swagger
 * /api/v1/bundles/{id}/activate:
 *   post:
 *     summary: Activate bundle
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
 *         description: Bundle activated successfully
 */
router.post('/:id/activate', asyncHandler(async (req, res) => {
  // TODO: Implement activate bundle logic
  res.json({ message: 'Activate bundle - to be implemented' });
}));

/**
 * @swagger
 * /api/v1/bundles/{id}/deactivate:
 *   post:
 *     summary: Deactivate bundle
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
 *         description: Bundle deactivated successfully
 */
router.post('/:id/deactivate', asyncHandler(async (req, res) => {
  // TODO: Implement deactivate bundle logic
  res.json({ message: 'Deactivate bundle - to be implemented' });
}));

module.exports = router;
