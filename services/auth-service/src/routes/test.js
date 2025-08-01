const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const { authenticate, authorize, requestId } = require('../middleware/auth');
const emailService = require('../services/email');
const smsService = require('../services/sms');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication and request ID to all routes
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
 * /api/v1/test/email:
 *   post:
 *     summary: Test email service configuration
 *     tags: [Testing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               testType:
 *                 type: string
 *                 enum: [connection, verification, welcome, password-reset]
 *                 default: connection
 *     responses:
 *       200:
 *         description: Email test completed
 *       400:
 *         description: Validation error
 */
router.post('/email', [
  authenticate,
  authorize(['platform_admin']), // Only admins can test services
  body('email').isEmail().withMessage('Valid email address is required'),
  body('testType')
    .optional()
    .isIn(['connection', 'verification', 'welcome', 'password-reset'])
    .withMessage('Invalid test type'),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  try {
    const { email, testType = 'connection' } = req.body;
    const userName = email.split('@')[0];

    let result;

    switch (testType) {
      case 'connection':
        result = await emailService.testConnection();
        break;
      
      case 'verification':
        const verificationToken = 'TEST-' + Math.random().toString(36).substr(2, 8);
        result = await emailService.sendEmailVerification(email, verificationToken, userName);
        break;
      
      case 'welcome':
        result = await emailService.sendWelcomeEmail(email, userName, 'household');
        break;
      
      case 'password-reset':
        const resetToken = 'RESET-' + Math.random().toString(36).substr(2, 8);
        result = await emailService.sendPasswordReset(email, resetToken, userName);
        break;
      
      default:
        result = { success: false, message: 'Invalid test type' };
    }

    logger.info('Email service test completed', {
      email,
      testType,
      success: result.success,
      requestId: req.requestId
    });

    res.json({
      message: 'Email service test completed',
      testType,
      email,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Email service test failed:', {
      error: error.message,
      email: req.body.email,
      testType: req.body.testType,
      requestId: req.requestId
    });
    throw error;
  }
}));

/**
 * @swagger
 * /api/v1/test/sms:
 *   post:
 *     summary: Test SMS service configuration
 *     tags: [Testing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               testType:
 *                 type: string
 *                 enum: [connection, verification, password-reset, emergency]
 *                 default: connection
 *     responses:
 *       200:
 *         description: SMS test completed
 *       400:
 *         description: Validation error
 */
router.post('/sms', [
  authenticate,
  authorize(['platform_admin']), // Only admins can test services
  body('phoneNumber').isMobilePhone().withMessage('Valid phone number is required'),
  body('testType')
    .optional()
    .isIn(['connection', 'verification', 'password-reset', 'emergency'])
    .withMessage('Invalid test type'),
  handleValidationErrors
], asyncHandler(async (req, res) => {
  try {
    const { phoneNumber, testType = 'connection' } = req.body;
    const userName = 'TestUser';

    let result;

    switch (testType) {
      case 'connection':
        result = await smsService.testConnection();
        break;
      
      case 'verification':
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        result = await smsService.sendPhoneVerification(phoneNumber, otp, userName);
        break;
      
      case 'password-reset':
        const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
        result = await smsService.sendPasswordResetOTP(phoneNumber, resetOtp, userName);
        break;
      
      case 'emergency':
        const estimatedArrival = new Date(Date.now() + 30 * 60 * 1000).toLocaleTimeString();
        result = await smsService.sendEmergencyNotification(phoneNumber, estimatedArrival, userName);
        break;
      
      default:
        result = { success: false, message: 'Invalid test type' };
    }

    logger.info('SMS service test completed', {
      phoneNumber: smsService.maskPhoneNumber(phoneNumber),
      testType,
      success: result.success,
      requestId: req.requestId
    });

    res.json({
      message: 'SMS service test completed',
      testType,
      phoneNumber: smsService.maskPhoneNumber(phoneNumber),
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('SMS service test failed:', {
      error: error.message,
      phoneNumber: smsService.maskPhoneNumber(req.body.phoneNumber),
      testType: req.body.testType,
      requestId: req.requestId
    });
    throw error;
  }
}));

/**
 * @swagger
 * /api/v1/test/services:
 *   get:
 *     summary: Get service status overview
 *     tags: [Testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service status retrieved
 */
router.get('/services', [
  authenticate,
  authorize(['platform_admin'])
], asyncHandler(async (req, res) => {
  try {
    const emailStatus = await emailService.testConnection();
    const smsStatus = await smsService.testConnection();

    const serviceStatus = {
      email: {
        configured: emailService.isConfigured,
        status: emailStatus,
        provider: 'SMTP'
      },
      sms: {
        configured: smsService.isConfigured,
        status: smsStatus,
        provider: smsService.provider
      },
      timestamp: new Date().toISOString()
    };

    logger.info('Service status check completed', {
      emailConfigured: emailService.isConfigured,
      smsConfigured: smsService.isConfigured,
      requestId: req.requestId
    });

    res.json({
      message: 'Service status retrieved successfully',
      services: serviceStatus
    });
  } catch (error) {
    logger.error('Service status check failed:', {
      error: error.message,
      requestId: req.requestId
    });
    throw error;
  }
}));

module.exports = router;
