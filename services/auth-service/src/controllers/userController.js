const { query } = require('../database/connection');
const User = require('../models/User');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class UserController {
  /**
   * Get all users with pagination and filtering (admin only)
   */
  static async getUsers(req, res) {
    try {
      const {
        limit = 20,
        offset = 0,
        role,
        isActive,
        isVerified,
        search,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // Validate pagination parameters
      const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      // Build WHERE clause
      let whereClause = 'WHERE 1=1';
      const queryParams = [];
      let paramIndex = 1;

      // Add filters
      if (role) {
        whereClause += ` AND role = $${paramIndex}`;
        queryParams.push(role);
        paramIndex++;
      }

      if (isActive !== undefined) {
        whereClause += ` AND is_active = $${paramIndex}`;
        queryParams.push(isActive === 'true');
        paramIndex++;
      }

      if (isVerified !== undefined) {
        whereClause += ` AND is_verified = $${paramIndex}`;
        queryParams.push(isVerified === 'true');
        paramIndex++;
      }

      if (search) {
        whereClause += ` AND (email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // Validate sort parameters
      const validSortFields = ['created_at', 'updated_at', 'email', 'role', 'last_login_at'];
      const validSortOrders = ['asc', 'desc'];
      
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const sortDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toUpperCase() : 'DESC';

      // Get users with pagination
      const usersQuery = `
        SELECT 
          u.id, u.email, u.phone, u.role, u.is_active, u.is_verified,
          u.email_verified_at, u.phone_verified_at, u.last_login_at,
          u.failed_login_attempts, u.locked_until, u.created_at, u.updated_at,
          p.first_name, p.last_name, p.business_name
        FROM auth.users u
        LEFT JOIN auth.profiles p ON u.id = p.user_id
        ${whereClause}
        ORDER BY u.${sortField} ${sortDirection}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const usersResult = await query(usersQuery, [...queryParams, limitNum, offsetNum]);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM auth.users u
        ${whereClause}
      `;
      const countResult = await query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total, 10);

      // Format users data
      const users = usersResult.rows.map(row => ({
        id: row.id,
        email: row.email,
        phone: row.phone,
        role: row.role,
        isActive: row.is_active,
        isVerified: row.is_verified,
        emailVerifiedAt: row.email_verified_at,
        phoneVerifiedAt: row.phone_verified_at,
        lastLoginAt: row.last_login_at,
        failedLoginAttempts: row.failed_login_attempts,
        isLocked: row.locked_until && new Date(row.locked_until) > new Date(),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        profile: {
          firstName: row.first_name,
          lastName: row.last_name,
          businessName: row.business_name
        }
      }));

      logger.info('Users retrieved', {
        adminId: req.user.id,
        total,
        limit: limitNum,
        offset: offsetNum,
        filters: { role, isActive, isVerified, search }
      });

      res.json({
        users,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          page: Math.floor(offsetNum / limitNum) + 1,
          totalPages: Math.ceil(total / limitNum),
          hasNext: offsetNum + limitNum < total,
          hasPrev: offsetNum > 0
        },
        filters: {
          role,
          isActive,
          isVerified,
          search,
          sortBy: sortField,
          sortOrder: sortDirection
        }
      });
    } catch (error) {
      logger.error('Failed to get users:', {
        error: error.message,
        adminId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Get user by ID (admin only)
   */
  static async getUserById(req, res) {
    try {
      const { id } = req.params;

      // Get user with profile information
      const userQuery = `
        SELECT 
          u.id, u.email, u.phone, u.role, u.is_active, u.is_verified,
          u.email_verified_at, u.phone_verified_at, u.last_login_at,
          u.failed_login_attempts, u.locked_until, u.created_at, u.updated_at,
          p.first_name, p.last_name, p.business_name
        FROM auth.users u
        LEFT JOIN auth.profiles p ON u.id = p.user_id
        WHERE u.id = $1
      `;

      const userResult = await query(userQuery, [id]);

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const row = userResult.rows[0];

      // Get user addresses
      const addressesResult = await query(
        'SELECT * FROM auth.addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
        [id]
      );

      // Get user sessions (active tokens) - handle if sessions table doesn't exist
      let sessionsResult = { rows: [] };
      try {
        sessionsResult = await query(
          'SELECT * FROM auth.sessions WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC',
          [id]
        );
      } catch (error) {
        // Sessions table might not exist, continue without session info
        logger.warn('Sessions table not found, skipping session count', { userId: id });
      }

      const user = {
        id: row.id,
        email: row.email,
        phone: row.phone,
        role: row.role,
        isActive: row.is_active,
        isVerified: row.is_verified,
        emailVerifiedAt: row.email_verified_at,
        phoneVerifiedAt: row.phone_verified_at,
        lastLoginAt: row.last_login_at,
        failedLoginAttempts: row.failed_login_attempts,
        isLocked: row.locked_until && new Date(row.locked_until) > new Date(),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        profile: {
          firstName: row.first_name,
          lastName: row.last_name,
          businessName: row.business_name
        },
        addresses: addressesResult.rows.map(addr => ({
          id: addr.id,
          label: addr.label,
          addressLine1: addr.address_line_1,
          addressLine2: addr.address_line_2,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postal_code,
          country: addr.country,
          isDefault: addr.is_default,
          createdAt: addr.created_at
        })),
        activeSessions: sessionsResult.rows.length
      };

      logger.info('User retrieved by admin', {
        adminId: req.user.id,
        targetUserId: id
      });

      res.json({ user });
    } catch (error) {
      logger.error('Failed to get user by ID:', {
        error: error.message,
        adminId: req.user.id,
        targetUserId: req.params.id
      });
      throw error;
    }
  }

  /**
   * Update user status (admin only)
   */
  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive, isVerified } = req.body;

      // Check if user exists
      const user = await User.findById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Build update query
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(isActive);
        paramIndex++;
      }

      if (isVerified !== undefined) {
        updates.push(`is_verified = $${paramIndex}`);
        params.push(isVerified);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new ValidationError('No valid updates provided');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);

      const updateQuery = `
        UPDATE auth.users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, email, role, is_active, is_verified, updated_at
      `;

      const result = await query(updateQuery, params);
      const updatedUser = result.rows[0];

      logger.info('User status updated by admin', {
        adminId: req.user.id,
        targetUserId: id,
        updates: { isActive, isVerified }
      });

      res.json({
        message: 'User status updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          isActive: updatedUser.is_active,
          isVerified: updatedUser.is_verified,
          updatedAt: updatedUser.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to update user status:', {
        error: error.message,
        adminId: req.user.id,
        targetUserId: req.params.id
      });
      throw error;
    }
  }
}

module.exports = UserController;
