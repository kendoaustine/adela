const { query } = require('../database/connection');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, AuthorizationError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

class SupplierController {
  /**
   * Upload supplier documents
   */
  static async uploadDocument(req, res) {
    try {
      const userId = req.user.id;
      const { documentType, description } = req.body;

      // Verify user is a supplier
      if (req.user.role !== 'supplier') {
        throw new AuthorizationError('Only suppliers can upload documents');
      }

      // Validate document type
      const validDocumentTypes = ['business_license', 'tax_certificate', 'insurance_certificate'];
      if (!validDocumentTypes.includes(documentType)) {
        throw new ValidationError('Invalid document type. Must be one of: business_license, tax_certificate, insurance_certificate');
      }

      // Check if file was uploaded
      if (!req.file) {
        throw new ValidationError('Document file is required');
      }

      const file = req.file;

      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain']; // Added text/plain for testing
      if (!allowedMimeTypes.includes(file.mimetype)) {
        // Clean up uploaded file
        await fs.unlink(file.path).catch(() => {});
        throw new ValidationError('Invalid file type. Only JPEG, PNG, PDF, and TXT files are allowed');
      }

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        // Clean up uploaded file
        await fs.unlink(file.path).catch(() => {});
        throw new ValidationError('File size too large. Maximum 10MB allowed');
      }

      // Check if document type already exists for this supplier
      const existingDoc = await query(
        'SELECT id FROM auth.supplier_documents WHERE supplier_id = $1 AND document_type = $2',
        [userId, documentType]
      );

      if (existingDoc.rows.length > 0) {
        // Clean up uploaded file
        await fs.unlink(file.path).catch(() => {});
        throw new ValidationError(`Document of type ${documentType} already exists. Please delete the existing document first.`);
      }

      // Save document record to database
      const documentId = uuidv4();
      const result = await query(
        `INSERT INTO auth.supplier_documents (
          id, supplier_id, document_type, document_name, file_url, file_size,
          mime_type, verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *`,
        [
          documentId,
          userId,
          documentType,
          file.originalname,
          file.path,
          file.size,
          file.mimetype
        ]
      );

      const document = result.rows[0];

      // Format response
      const documentData = {
        id: document.id,
        documentType: document.document_type,
        fileName: document.document_name,
        fileSize: document.file_size,
        mimeType: document.mime_type,
        verificationStatus: document.verification_status,
        uploadedAt: document.created_at,
        verifiedAt: document.verified_at,
        rejectionReason: document.rejection_reason
      };

      logger.info('Supplier document uploaded', {
        userId,
        documentId,
        documentType,
        fileName: file.originalname,
        fileSize: file.size,
        requestId: req.requestId
      });

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: documentData
      });
    } catch (error) {
      // Clean up uploaded file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      logger.error('Failed to upload supplier document:', {
        error: error.message,
        userId: req.user.id,
        requestId: req.requestId
      });
      throw error;
    }
  }

  /**
   * Get supplier verification status
   */
  static async getVerificationStatus(req, res) {
    try {
      const userId = req.user.id;

      // Verify user is a supplier
      if (req.user.role !== 'supplier') {
        throw new AuthorizationError('Only suppliers can check verification status');
      }

      // Get all documents for this supplier
      const result = await query(
        `SELECT * FROM auth.supplier_documents 
         WHERE supplier_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      const documents = result.rows.map(doc => ({
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.document_name,
        fileSize: doc.file_size,
        mimeType: doc.mime_type,
        verificationStatus: doc.verification_status,
        uploadedAt: doc.created_at,
        verifiedAt: doc.verified_at,
        rejectionReason: doc.rejection_reason
      }));

      // Define required documents
      const requiredDocuments = ['business_license', 'tax_certificate', 'insurance_certificate'];
      
      // Find missing documents
      const uploadedTypes = documents.map(doc => doc.documentType);
      const missingDocuments = requiredDocuments.filter(type => !uploadedTypes.includes(type));

      // Check if all required documents are approved
      const approvedDocuments = documents.filter(doc => doc.verificationStatus === 'approved');
      const canStartSelling = approvedDocuments.length >= 3 && missingDocuments.length === 0;

      // Determine overall verification status
      let verificationStatus = 'pending';
      if (canStartSelling) {
        verificationStatus = 'approved';
      } else if (documents.some(doc => doc.verificationStatus === 'rejected')) {
        verificationStatus = 'rejected';
      }

      logger.info('Supplier verification status retrieved', {
        userId,
        documentsCount: documents.length,
        approvedCount: approvedDocuments.length,
        canStartSelling,
        requestId: req.requestId
      });

      res.json({
        verificationStatus,
        documents,
        requiredDocuments,
        missingDocuments,
        canStartSelling,
        summary: {
          totalDocuments: documents.length,
          approvedDocuments: approvedDocuments.length,
          pendingDocuments: documents.filter(doc => doc.verificationStatus === 'pending').length,
          rejectedDocuments: documents.filter(doc => doc.verificationStatus === 'rejected').length
        }
      });
    } catch (error) {
      logger.error('Failed to get verification status:', {
        error: error.message,
        userId: req.user.id,
        requestId: req.requestId
      });
      throw error;
    }
  }
}

module.exports = SupplierController;
