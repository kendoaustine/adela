const { query } = require('../database/connection');

class User {
  constructor(userData) {
    this.id = userData.id;
    this.email = userData.email;
    this.phone = userData.phone;
    this.role = userData.role;
    this.isVerified = userData.is_verified;
    this.isActive = userData.is_active;
    this.lastLoginAt = userData.last_login_at;
    this.failedLoginAttempts = userData.failed_login_attempts;
    this.lockedUntil = userData.locked_until;
    this.createdAt = userData.created_at;
    this.updatedAt = userData.updated_at;
  }

  /**
   * Find user by ID
   */
  static async findById(userId) {
    try {
      const result = await query(
        'SELECT * FROM auth.users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find user: ${error.message}`);
    }
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    try {
      const result = await query(
        'SELECT * FROM auth.users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  }

  /**
   * Check if account is locked
   */
  isLocked() {
    if (!this.lockedUntil) {
      return false;
    }
    return new Date() < new Date(this.lockedUntil);
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    return this.role === role;
  }

  /**
   * Check if user is supplier
   */
  isSupplier() {
    return this.role === 'supplier';
  }

  /**
   * Check if user is household
   */
  isHousehold() {
    return this.role === 'household';
  }

  /**
   * Check if user is delivery driver
   */
  isDeliveryDriver() {
    return this.role === 'delivery_driver';
  }

  /**
   * Get user profile information
   */
  async getProfile() {
    try {
      const result = await query(
        'SELECT * FROM auth.profiles WHERE user_id = $1',
        [this.id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name,
        businessName: result.rows[0].business_name
      };
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Convert to JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      phone: this.phone,
      role: this.role,
      isVerified: this.isVerified,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = User;
