const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const UserController = require('../controllers/userController');

const router = express.Router();
router.use(requestId);

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
 * /api/v1/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [household, supplier, delivery_driver, platform_admin]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: isVerified
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, updated_at, email, role, last_login_at]
 *           default: created_at
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', [
  authenticate,
  authorize('platform_admin'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be 0 or greater'),
  query('role')
    .optional()
    .isIn(['household', 'supplier', 'delivery_driver', 'platform_admin'])
    .withMessage('Invalid role filter'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  query('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be boolean'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search term must not be empty'),
  query('sortBy')
    .optional()
    .isIn(['created_at', 'updated_at', 'email', 'role', 'last_login_at'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  handleValidationErrors
], asyncHandler(UserController.getUsers));

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
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
 *         description: User retrieved successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', [
  authenticate,
  authorize('platform_admin'),
], asyncHandler(UserController.getUserById));

/**
 * @swagger
 * /api/v1/users/{id}/status:
 *   put:
 *     summary: Update user status (admin only)
 *     tags: [Users]
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
 *               isActive:
 *                 type: boolean
 *               isVerified:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User status updated successfully
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:id/status', [
  authenticate,
  authorize('platform_admin'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  body('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be boolean'),
  handleValidationErrors
], asyncHandler(UserController.updateUserStatus));

module.exports = router;
