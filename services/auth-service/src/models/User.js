const { query, transaction } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const argon2 = require('argon2');
const config = require('../config');
const logger = require('../utils/logger');

class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.phone = data.phone;
    this.passwordHash = data.password_hash;
    this.role = data.role;
    this.isActive = data.is_active;
    this.isVerified = data.is_verified;
    this.emailVerifiedAt = data.email_verified_at;
    this.phoneVerifiedAt = data.phone_verified_at;
    this.lastLoginAt = data.last_login_at;
    this.failedLoginAttempts = data.failed_login_attempts;
    this.lockedUntil = data.locked_until;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  /**
   * Create a new user
   */
  static async create(userData) {
    const { email, phone, password, role } = userData;
    
    try {
      const passwordHash = await argon2.hash(password, config.password.argon2);
      const userId = uuidv4();
      
      const result = await query(
        `INSERT INTO auth.users (id, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, email, phone, passwordHash, role]
      );
      
      logger.info('User created', { userId, email, role });
      return new User(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    try {
      const result = await query(
        'SELECT * FROM auth.users WHERE id = $1 AND is_active = true',
        [id]
      );
      
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to find user by ID:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    try {
      const result = await query(
        'SELECT * FROM auth.users WHERE email = $1 AND is_active = true',
        [email]
      );
      
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to find user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by phone
   */
  static async findByPhone(phone) {
    try {
      const result = await query(
        'SELECT * FROM auth.users WHERE phone = $1 AND is_active = true',
        [phone]
      );
      
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to find user by phone:', error);
      throw error;
    }
  }

  /**
   * Find user by email or phone
   */
  static async findByEmailOrPhone(identifier) {
    try {
      const result = await query(
        'SELECT * FROM auth.users WHERE (email = $1 OR phone = $1) AND is_active = true',
        [identifier]
      );
      
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to find user by email or phone:', error);
      throw error;
    }
  }

  /**
   * Verify password
   */
  async verifyPassword(password) {
    try {
      return await argon2.verify(this.passwordHash, password);
    } catch (error) {
      logger.error('Failed to verify password:', error);
      return false;
    }
  }

  /**
   * Update password
   */
  async updatePassword(newPassword) {
    try {
      const passwordHash = await argon2.hash(newPassword, config.password.argon2);
      
      await query(
        `UPDATE auth.users 
         SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [passwordHash, this.id]
      );
      
      this.passwordHash = passwordHash;
      this.failedLoginAttempts = 0;
      this.lockedUntil = null;
      
      logger.info('Password updated', { userId: this.id });
    } catch (error) {
      logger.error('Failed to update password:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin() {
    try {
      await query(
        `UPDATE auth.users 
         SET last_login_at = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [this.id]
      );
      
      this.lastLoginAt = new Date();
      this.failedLoginAttempts = 0;
      this.lockedUntil = null;
      
      logger.debug('Last login updated', { userId: this.id });
    } catch (error) {
      logger.error('Failed to update last login:', error);
      throw error;
    }
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedLoginAttempts() {
    try {
      const maxAttempts = config.security.maxLoginAttempts;
      const lockoutDuration = config.security.lockoutDuration;
      
      const result = await query(
        `UPDATE auth.users 
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE 
               WHEN failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + INTERVAL '${lockoutDuration} milliseconds'
               ELSE locked_until
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING failed_login_attempts, locked_until`,
        [this.id, maxAttempts]
      );
      
      if (result.rows.length > 0) {
        this.failedLoginAttempts = result.rows[0].failed_login_attempts;
        this.lockedUntil = result.rows[0].locked_until;
      }
      
      logger.warn('Failed login attempt', { 
        userId: this.id, 
        attempts: this.failedLoginAttempts,
        locked: !!this.lockedUntil 
      });
    } catch (error) {
      logger.error('Failed to increment login attempts:', error);
      throw error;
    }
  }

  /**
   * Check if account is locked
   */
  isLocked() {
    return this.lockedUntil && new Date(this.lockedUntil) > new Date();
  }

  /**
   * Verify email
   */
  async verifyEmail() {
    try {
      await query(
        `UPDATE auth.users 
         SET email_verified_at = CURRENT_TIMESTAMP, is_verified = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [this.id]
      );
      
      this.emailVerifiedAt = new Date();
      this.isVerified = true;
      
      logger.info('Email verified', { userId: this.id });
    } catch (error) {
      logger.error('Failed to verify email:', error);
      throw error;
    }
  }

  /**
   * Verify phone
   */
  async verifyPhone() {
    try {
      await query(
        `UPDATE auth.users 
         SET phone_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [this.id]
      );
      
      this.phoneVerifiedAt = new Date();
      
      logger.info('Phone verified', { userId: this.id });
    } catch (error) {
      logger.error('Failed to verify phone:', error);
      throw error;
    }
  }

  /**
   * Deactivate user account
   */
  async deactivate() {
    try {
      await query(
        `UPDATE auth.users 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [this.id]
      );
      
      this.isActive = false;
      
      logger.info('User deactivated', { userId: this.id });
    } catch (error) {
      logger.error('Failed to deactivate user:', error);
      throw error;
    }
  }

  /**
   * Get user's profile
   */
  async getProfile() {
    try {
      const result = await query(
        'SELECT * FROM auth.profiles WHERE user_id = $1',
        [this.id]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      throw error;
    }
  }

  /**
   * Get user's addresses
   */
  async getAddresses() {
    try {
      const result = await query(
        'SELECT * FROM auth.addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
        [this.id]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user addresses:', error);
      throw error;
    }
  }

  /**
   * Convert to JSON (excluding sensitive data)
   */
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      phone: this.phone,
      role: this.role,
      isActive: this.isActive,
      isVerified: this.isVerified,
      emailVerifiedAt: this.emailVerifiedAt,
      phoneVerifiedAt: this.phoneVerifiedAt,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = User;
