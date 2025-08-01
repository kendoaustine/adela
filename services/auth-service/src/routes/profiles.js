const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requestId, auditLog } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const ProfileController = require('../controllers/profileController');

const router = express.Router();
router.use(requestId);

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
 * /api/v1/profiles:
 *   get:
 *     summary: Get user profile
 *     tags: [Profiles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       404:
 *         description: Profile not found
 */
router.get('/', [
  authenticate,
  auditLog('get_profile'),
], asyncHandler(ProfileController.getProfile));

/**
 * @swagger
 * /api/v1/profiles:
 *   put:
 *     summary: Update user profile
 *     tags: [Profiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *             properties:
 *               firstName:
 *                 type: string
 *                 maxLength: 100
 *               lastName:
 *                 type: string
 *                 maxLength: 100
 *               businessName:
 *                 type: string
 *                 maxLength: 255
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Profile not found
 */
router.put('/', [
  authenticate,
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name is required and must be less than 100 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name is required and must be less than 100 characters'),
  body('businessName')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Business name must be less than 255 characters'),
  handleValidationErrors,
  auditLog('update_profile'),
], asyncHandler(ProfileController.updateProfile));

module.exports = router;
