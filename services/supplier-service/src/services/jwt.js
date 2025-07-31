const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const { query } = require('../database/connection');

class JWTService {
  /**
   * Generate access token
   */
  static generateAccessToken(user, additionalClaims = {}) {
    const payload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
      iat: Math.floor(Date.now() / 1000),
      jti: uuidv4(),
      ...additionalClaims,
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user, deviceInfo = {}) {
    const payload = {
      sub: user.id,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      jti: uuidv4(),
    };

    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      });
    } catch (error) {
      logger.debug('Access token verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, config.jwt.refreshSecret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      });
    } catch (error) {
      logger.debug('Refresh token verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token) {
    return jwt.decode(token, { complete: true });
  }

  /**
   * Store refresh token in database
   */
  static async storeRefreshToken(userId, tokenHash, expiresAt, deviceInfo = {}, ipAddress = null) {
    try {
      const result = await query(
        `INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at, device_info, ip_address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, tokenHash, expiresAt, JSON.stringify(deviceInfo), ipAddress]
      );

      logger.debug('Refresh token stored', { userId, tokenId: result.rows[0].id });
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to store refresh token:', error);
      throw error;
    }
  }

  /**
   * Validate refresh token from database
   */
  static async validateRefreshToken(userId, tokenHash) {
    try {
      const result = await query(
        `SELECT * FROM auth.refresh_tokens 
         WHERE user_id = $1 AND token_hash = $2 AND expires_at > CURRENT_TIMESTAMP AND is_revoked = false`,
        [userId, tokenHash]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Failed to validate refresh token:', error);
      throw error;
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(userId, tokenHash) {
    try {
      await query(
        `UPDATE auth.refresh_tokens 
         SET is_revoked = true 
         WHERE user_id = $1 AND token_hash = $2`,
        [userId, tokenHash]
      );

      logger.debug('Refresh token revoked', { userId });
    } catch (error) {
      logger.error('Failed to revoke refresh token:', error);
      throw error;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  static async revokeAllRefreshTokens(userId) {
    try {
      const result = await query(
        `UPDATE auth.refresh_tokens 
         SET is_revoked = true 
         WHERE user_id = $1 AND is_revoked = false
         RETURNING id`,
        [userId]
      );

      logger.info('All refresh tokens revoked', { userId, count: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to revoke all refresh tokens:', error);
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpiredTokens() {
    try {
      const result = await query(
        'DELETE FROM auth.refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP'
      );

      logger.info('Expired tokens cleaned up', { count: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error);
      throw error;
    }
  }

  /**
   * Generate token pair (access + refresh)
   */
  static async generateTokenPair(user, deviceInfo = {}, ipAddress = null) {
    try {
      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user, deviceInfo);

      // Decode refresh token to get expiration
      const decodedRefresh = this.decodeToken(refreshToken);
      const expiresAt = new Date(decodedRefresh.payload.exp * 1000);

      // Hash refresh token for storage
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Store refresh token
      await this.storeRefreshToken(user.id, tokenHash, expiresAt, deviceInfo, ipAddress);

      return {
        accessToken,
        refreshToken,
        expiresIn: decodedRefresh.payload.exp - decodedRefresh.payload.iat,
        tokenType: 'Bearer',
      };
    } catch (error) {
      logger.error('Failed to generate token pair:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken, deviceInfo = {}, ipAddress = null) {
    try {
      // Verify refresh token
      const decoded = this.verifyRefreshToken(refreshToken);
      
      // Hash token for database lookup
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Validate token in database
      const storedToken = await this.validateRefreshToken(decoded.sub, tokenHash);
      if (!storedToken) {
        throw new Error('Invalid refresh token');
      }

      // Get user data
      const User = require('../models/User');
      const user = await User.findById(decoded.sub);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      // Optionally rotate refresh token (recommended for security)
      let newRefreshToken = refreshToken;
      if (config.jwt.rotateRefreshTokens) {
        // Revoke old token
        await this.revokeRefreshToken(decoded.sub, tokenHash);
        
        // Generate new refresh token
        newRefreshToken = this.generateRefreshToken(user, deviceInfo);
        const newDecoded = this.decodeToken(newRefreshToken);
        const newExpiresAt = new Date(newDecoded.payload.exp * 1000);
        const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
        
        // Store new refresh token
        await this.storeRefreshToken(user.id, newTokenHash, newExpiresAt, deviceInfo, ipAddress);
      }

      const decodedAccess = this.decodeToken(accessToken);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: decodedAccess.payload.exp - decodedAccess.payload.iat,
        tokenType: 'Bearer',
      };
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw error;
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Get token expiration time
   */
  static getTokenExpiration(token) {
    try {
      const decoded = this.decodeToken(token);
      return new Date(decoded.payload.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token) {
    const expiration = this.getTokenExpiration(token);
    return expiration ? expiration < new Date() : true;
  }
}

module.exports = JWTService;
