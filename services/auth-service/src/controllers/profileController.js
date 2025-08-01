const { query } = require('../database/connection');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class ProfileController {
  /**
   * Get user profile
   */
  static async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const result = await query(
        `SELECT p.*, u.role, u.email, u.phone
         FROM auth.profiles p 
         JOIN auth.users u ON p.user_id = u.id 
         WHERE p.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Profile not found');
      }

      const profile = result.rows[0];

      // Format response
      const profileData = {
        userId: profile.user_id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        businessName: profile.business_name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      };

      logger.info('Profile retrieved', { userId, requestId: req.requestId });

      res.json({
        profile: profileData
      });
    } catch (error) {
      logger.error('Failed to get profile:', { error: error.message, userId: req.user.id });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { firstName, lastName, businessName } = req.body;

      // Validation
      if (!firstName || firstName.trim().length === 0) {
        throw new ValidationError('First name is required');
      }
      if (!lastName || lastName.trim().length === 0) {
        throw new ValidationError('Last name is required');
      }
      if (firstName.length > 100) {
        throw new ValidationError('First name must be less than 100 characters');
      }
      if (lastName.length > 100) {
        throw new ValidationError('Last name must be less than 100 characters');
      }
      if (businessName && businessName.length > 255) {
        throw new ValidationError('Business name must be less than 255 characters');
      }

      // Check if user is supplier for business name validation
      const userResult = await query(
        'SELECT role FROM auth.users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const userRole = userResult.rows[0].role;

      // Business name validation based on role
      if (businessName && userRole !== 'supplier') {
        throw new ValidationError('Business name can only be set for supplier accounts');
      }

      // Update profile
      const result = await query(
        `UPDATE auth.profiles 
         SET first_name = $2, last_name = $3, business_name = $4, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING *`,
        [userId, firstName.trim(), lastName.trim(), businessName ? businessName.trim() : null]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Profile not found');
      }

      const updatedProfile = result.rows[0];

      // Format response
      const profileData = {
        userId: updatedProfile.user_id,
        firstName: updatedProfile.first_name,
        lastName: updatedProfile.last_name,
        businessName: updatedProfile.business_name,
        role: userRole,
        createdAt: updatedProfile.created_at,
        updatedAt: updatedProfile.updated_at
      };

      logger.info('Profile updated', { 
        userId, 
        changes: { firstName, lastName, businessName },
        requestId: req.requestId 
      });

      res.json({
        message: 'Profile updated successfully',
        profile: profileData
      });
    } catch (error) {
      logger.error('Failed to update profile:', { 
        error: error.message, 
        userId: req.user.id,
        requestId: req.requestId 
      });
      throw error;
    }
  }
}

module.exports = ProfileController;
