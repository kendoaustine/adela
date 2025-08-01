const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const { cache, invalidateCache } = require('../middleware/cache');
const PaymentController = require('../controllers/paymentController');

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
 * /api/v1/payments:
 *   get:
 *     summary: Get payment history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, refunded, escrowed]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 */
/**
 * @swagger
 * /api/v1/payments/wallet:
 *   get:
 *     summary: Get user wallet information
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           default: NGN
 *     responses:
 *       200:
 *         description: Wallet information retrieved successfully
 */
router.get('/wallet', [
  query('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters'),
  handleValidationErrors,
  cache(300) // Cache for 5 minutes
], asyncHandler(PaymentController.getWallet));

/**
 * @swagger
 * /api/v1/payments/methods:
 *   get:
 *     summary: Get user payment methods
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment methods retrieved successfully
 */
router.get('/methods', [
  cache(600) // Cache for 10 minutes
], asyncHandler(PaymentController.getPaymentMethods));

/**
 * @swagger
 * /api/v1/payments/methods:
 *   post:
 *     summary: Add new payment method
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [card, bank_transfer, wallet, cash]
 *               provider:
 *                 type: string
 *               externalId:
 *                 type: string
 *               cardLastFour:
 *                 type: string
 *               cardBrand:
 *                 type: string
 *               bankName:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Payment method added successfully
 */
router.post('/methods', [
  body('type')
    .isIn(['card', 'bank_transfer', 'wallet', 'cash'])
    .withMessage('Invalid payment method type'),
  body('provider')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Provider cannot be empty'),
  body('externalId')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('External ID cannot be empty'),
  body('cardLastFour')
    .optional()
    .isLength({ min: 4, max: 4 })
    .withMessage('Card last four must be 4 digits'),
  body('cardBrand')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Card brand cannot be empty'),
  body('bankName')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Bank name cannot be empty'),
  body('accountNumber')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Account number cannot be empty'),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be boolean'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  handleValidationErrors,
  invalidateCache('payments')
], asyncHandler(PaymentController.addPaymentMethod));

/**
 * @swagger
 * /api/v1/payments/transactions:
 *   get:
 *     summary: Get transaction history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [payment, refund, wallet_credit, wallet_debit, escrow_hold, escrow_release]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled, refunded]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
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
 *         description: Transaction history retrieved successfully
 */
router.get('/transactions', [
  query('type')
    .optional()
    .isIn(['payment', 'refund', 'wallet_credit', 'wallet_debit', 'escrow_hold', 'escrow_release'])
    .withMessage('Invalid transaction type'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'])
    .withMessage('Invalid transaction status'),
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
  cache(60) // Cache for 1 minute
], asyncHandler(PaymentController.getTransactions));

/**
 * @swagger
 * /api/v1/payments/wallet/credit:
 *   post:
 *     summary: Credit wallet with funds
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - paymentMethodId
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               currency:
 *                 type: string
 *                 default: NGN
 *               description:
 *                 type: string
 *               paymentMethodId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Wallet credited successfully
 */
router.post('/wallet/credit', [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('paymentMethodId')
    .isUUID()
    .withMessage('Valid payment method ID is required'),
  handleValidationErrors,
  invalidateCache('payments')
], asyncHandler(PaymentController.creditWallet));

/**
 * @swagger
 * /api/v1/payments/process:
 *   post:
 *     summary: Process payment for order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - paymentMethodId
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               currency:
 *                 type: string
 *                 default: NGN
 *               paymentMethodId:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               useEscrow:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Payment processed successfully
 */
router.post('/process', [
  body('orderId')
    .optional()
    .isUUID()
    .withMessage('Valid order ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters'),
  body('paymentMethodId')
    .isUUID()
    .withMessage('Valid payment method ID is required'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('useEscrow')
    .optional()
    .isBoolean()
    .withMessage('useEscrow must be boolean'),
  handleValidationErrors,
  invalidateCache('payments')
], asyncHandler(PaymentController.processPayment));

/**
 * @swagger
 * /api/v1/payments/paystack/initialize:
 *   post:
 *     summary: Initialize Paystack payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - email
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               currency:
 *                 type: string
 *                 default: NGN
 *               email:
 *                 type: string
 *                 format: email
 *               orderId:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               callback_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 */
router.post('/paystack/initialize', [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least 1'),
  body('currency')
    .optional()
    .isIn(['NGN', 'USD', 'GHS', 'ZAR'])
    .withMessage('Invalid currency'),
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('orderId')
    .optional()
    .isUUID()
    .withMessage('Valid order ID is required'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('callback_url')
    .optional()
    .isURL()
    .withMessage('Valid callback URL is required'),
  handleValidationErrors,
  invalidateCache('payments')
], asyncHandler(PaymentController.initializePaystackPayment));

/**
 * @swagger
 * /api/v1/payments/paystack/verify/{reference}:
 *   get:
 *     summary: Verify Paystack payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment reference
 *     responses:
 *       200:
 *         description: Payment verification completed
 */
router.get('/paystack/verify/:reference', [
  invalidateCache('payments')
], asyncHandler(PaymentController.verifyPaystackPayment));

/**
 * @swagger
 * /api/v1/payments/paystack/webhook:
 *   post:
 *     summary: Handle Paystack webhook
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/paystack/webhook', asyncHandler(PaymentController.handlePaystackWebhook));

/**
 * @swagger
 * /api/v1/payments/banks:
 *   get:
 *     summary: Get supported banks
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Banks retrieved successfully
 */
router.get('/banks', [
  cache(3600) // Cache for 1 hour
], asyncHandler(PaymentController.getSupportedBanks));

/**
 * @swagger
 * /api/v1/payments/resolve-account:
 *   post:
 *     summary: Resolve account number
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - account_number
 *               - bank_code
 *             properties:
 *               account_number:
 *                 type: string
 *               bank_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account resolved successfully
 */
router.post('/resolve-account', [
  body('account_number')
    .trim()
    .isLength({ min: 10, max: 10 })
    .withMessage('Account number must be 10 digits'),
  body('bank_code')
    .trim()
    .isLength({ min: 3, max: 3 })
    .withMessage('Bank code must be 3 digits'),
  handleValidationErrors
], asyncHandler(PaymentController.resolveAccountNumber));

module.exports = router;
