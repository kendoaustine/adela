const express = require('express');
const { body, validationResult } = require('express-validator');
const AuthController = require('../controllers/authController');
const { authenticate, auditLog, requestId } = require('../middleware/auth');
const { ValidationError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Add request ID to all routes
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
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - phone
 *               - password
 *               - role
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               phone:
 *                 type: string
 *                 pattern: '^\+[1-9]\d{1,14}$'
 *                 example: "+2348012345678"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "SecurePass123!"
 *               role:
 *                 type: string
 *                 enum: [hospital, artisan, household, supplier, delivery_driver]
 *                 example: "household"
 *               firstName:
 *                 type: string
 *                 maxLength: 100
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Doe"
 *               businessName:
 *                 type: string
 *                 maxLength: 255
 *                 example: "Doe Enterprises"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   $ref: '#/components/schemas/AuthTokens'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         $ref: '#/components/responses/ConflictError'
 */
router.post('/register', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('Valid phone number in E.164 format is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('role')
    .isIn(['hospital', 'artisan', 'household', 'supplier', 'delivery_driver'])
    .withMessage('Valid role is required'),
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
  auditLog('user_register'),
], asyncHandler(AuthController.register));

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email or phone number
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 example: "SecurePass123!"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/login', [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or phone number is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors,
  auditLog('user_login'),
], asyncHandler(AuthController.login));

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: JWT refresh token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 tokens:
 *                   $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
  handleValidationErrors,
], asyncHandler(AuthController.refresh));

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: JWT refresh token to revoke
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/logout', [
  authenticate,
  auditLog('user_logout'),
], asyncHandler(AuthController.logout));

/**
 * @swagger
 * /api/v1/auth/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/logout-all', [
  authenticate,
  auditLog('user_logout_all'),
], asyncHandler(AuthController.logoutAll));

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 profile:
 *                   $ref: '#/components/schemas/Profile'
 *                 addresses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Address'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', [
  authenticate,
], asyncHandler(AuthController.me));

// Email verification routes
router.post('/send-email-verification', [
  authenticate,
  auditLog('send_email_verification'),
], asyncHandler(AuthController.sendEmailVerification));

router.post('/verify-email', [
  authenticate,
  body('token').notEmpty().withMessage('Verification token is required'),
  handleValidationErrors,
  auditLog('verify_email'),
], asyncHandler(AuthController.verifyEmail));

// Phone verification routes
router.post('/send-phone-verification', [
  authenticate,
  auditLog('send_phone_verification'),
], asyncHandler(AuthController.sendPhoneVerification));

router.post('/verify-phone', [
  authenticate,
  body('otp').isLength({ min: 6, max: 6 }).withMessage('Valid 6-digit OTP is required'),
  handleValidationErrors,
  auditLog('verify_phone'),
], asyncHandler(AuthController.verifyPhone));

// Password reset routes
router.post('/request-password-reset', [
  body('identifier').trim().notEmpty().withMessage('Email or phone number is required'),
  handleValidationErrors,
  auditLog('request_password_reset'),
], asyncHandler(AuthController.requestPasswordReset));

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  handleValidationErrors,
  auditLog('reset_password'),
], asyncHandler(AuthController.resetPassword));

module.exports = router;
