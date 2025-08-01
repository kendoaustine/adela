const { query, transaction } = require('../database/connection');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');

class AddressController {
  /**
   * Get user addresses
   */
  static async getAddresses(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, offset = 0 } = req.query;

      // Validate pagination parameters
      const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      // Get addresses with pagination
      const result = await query(
        `SELECT * FROM auth.addresses 
         WHERE user_id = $1 
         ORDER BY is_default DESC, created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limitNum, offsetNum]
      );

      // Get total count
      const countResult = await query(
        'SELECT COUNT(*) as total FROM auth.addresses WHERE user_id = $1',
        [userId]
      );

      const addresses = result.rows.map(address => ({
        id: address.id,
        userId: address.user_id,
        label: address.label,
        addressLine1: address.address_line_1,
        addressLine2: address.address_line_2,
        city: address.city,
        state: address.state,
        postalCode: address.postal_code,
        country: address.country,
        latitude: address.latitude,
        longitude: address.longitude,
        isDefault: address.is_default,
        deliveryInstructions: address.delivery_instructions,
        createdAt: address.created_at,
        updatedAt: address.updated_at
      }));

      const total = parseInt(countResult.rows[0].total, 10);

      logger.info('Addresses retrieved', { 
        userId, 
        count: addresses.length, 
        total,
        requestId: req.requestId 
      });

      res.json({
        addresses,
        pagination: {
          total,
          page: Math.floor(offsetNum / limitNum) + 1,
          limit: limitNum,
          hasNext: offsetNum + limitNum < total,
          hasPrev: offsetNum > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get addresses:', { 
        error: error.message, 
        userId: req.user.id,
        requestId: req.requestId 
      });
      throw error;
    }
  }

  /**
   * Create new address
   */
  static async createAddress(req, res) {
    try {
      const userId = req.user.id;
      const {
        label,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        isDefault = false
      } = req.body;

      // Validation
      if (!label || label.trim().length === 0) {
        throw new ValidationError('Address label is required');
      }
      if (!addressLine1 || addressLine1.trim().length === 0) {
        throw new ValidationError('Address line 1 is required');
      }
      if (!city || city.trim().length === 0) {
        throw new ValidationError('City is required');
      }
      if (!state || state.trim().length === 0) {
        throw new ValidationError('State is required');
      }
      if (!postalCode || postalCode.trim().length === 0) {
        throw new ValidationError('Postal code is required');
      }
      if (!country || country.trim().length === 0) {
        throw new ValidationError('Country is required');
      }

      // Length validations
      if (label.length > 50) {
        throw new ValidationError('Label must be less than 50 characters');
      }
      if (addressLine1.length > 255) {
        throw new ValidationError('Address line 1 must be less than 255 characters');
      }
      if (addressLine2 && addressLine2.length > 255) {
        throw new ValidationError('Address line 2 must be less than 255 characters');
      }
      if (city.length > 100) {
        throw new ValidationError('City must be less than 100 characters');
      }
      if (state.length > 100) {
        throw new ValidationError('State must be less than 100 characters');
      }
      if (postalCode.length > 20) {
        throw new ValidationError('Postal code must be less than 20 characters');
      }
      if (country.length > 100) {
        throw new ValidationError('Country must be less than 100 characters');
      }

      // Check address limit (max 10 per user)
      const countResult = await query(
        'SELECT COUNT(*) as count FROM auth.addresses WHERE user_id = $1',
        [userId]
      );

      if (parseInt(countResult.rows[0].count, 10) >= 10) {
        throw new ValidationError('Maximum 10 addresses allowed per user');
      }

      // Create address with transaction for default handling
      const addressId = uuidv4();
      
      const result = await transaction(async (trx) => {
        // If setting as default, unset other defaults
        if (isDefault) {
          await trx(
            'UPDATE auth.addresses SET is_default = false WHERE user_id = $1 AND is_default = true',
            [userId]
          );
        }

        // Insert new address
        const addressResult = await trx(
          `INSERT INTO auth.addresses (
            id, user_id, label, address_line_1, address_line_2,
            city, state, postal_code, country, is_default
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            addressId, userId, label.trim(), addressLine1.trim(),
            addressLine2 ? addressLine2.trim() : null,
            city.trim(), state.trim(), postalCode.trim(), country.trim(), isDefault
          ]
        );

        return addressResult.rows[0];
      });

      // Format response
      const addressData = {
        id: result.id,
        userId: result.user_id,
        label: result.label,
        addressLine1: result.address_line_1,
        addressLine2: result.address_line_2,
        city: result.city,
        state: result.state,
        postalCode: result.postal_code,
        country: result.country,
        latitude: result.latitude,
        longitude: result.longitude,
        isDefault: result.is_default,
        deliveryInstructions: result.delivery_instructions,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };

      logger.info('Address created', { 
        userId, 
        addressId,
        label,
        isDefault,
        requestId: req.requestId 
      });

      res.status(201).json({
        message: 'Address created successfully',
        address: addressData
      });
    } catch (error) {
      logger.error('Failed to create address:', { 
        error: error.message, 
        userId: req.user.id,
        requestId: req.requestId 
      });
      throw error;
    }
  }
}

module.exports = AddressController;
