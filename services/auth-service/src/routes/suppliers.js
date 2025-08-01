const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize, requestId, auditLog } = require('../middleware/auth');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');
const SupplierController = require('../controllers/supplierController');

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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/tmp/supplier-documents';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${req.user.id}-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain']; // Added text/plain for testing
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, PDF, and TXT allowed.'));
    }
  }
});

/**
 * @swagger
 * /api/v1/suppliers/documents:
 *   post:
 *     summary: Upload supplier verification document
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - documentType
 *               - file
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: [business_license, tax_certificate, insurance_certificate]
 *               file:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 */
router.post('/documents', [
  authenticate,
  authorize('supplier'),
  upload.single('file'),
  body('documentType')
    .isIn(['business_license', 'tax_certificate', 'insurance_certificate'])
    .withMessage('Invalid document type'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  handleValidationErrors,
  auditLog('upload_supplier_document'),
], asyncHandler(SupplierController.uploadDocument));

/**
 * @swagger
 * /api/v1/suppliers/verification-status:
 *   get:
 *     summary: Get supplier verification status
 *     tags: [Suppliers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification status retrieved successfully
 *       403:
 *         description: Access denied
 */
router.get('/verification-status', [
  authenticate,
  authorize('supplier'),
  auditLog('get_verification_status'),
], asyncHandler(SupplierController.getVerificationStatus));

module.exports = router;
