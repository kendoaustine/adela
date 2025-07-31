const CacheManager = require('./CacheManager');
const logger = require('../utils/logger');

/**
 * Authentication Service Cache Layer
 * Handles caching for user sessions, tokens, and authentication data
 */
class AuthCacheService extends CacheManager {
  constructor(config = {}) {
    super({
      keyPrefix: 'gasconnect:auth:',
      defaultTTL: 3600, // 1 hour
      ...config
    });

    // Cache TTL configurations
    this.ttl = {
      session: 24 * 60 * 60,        // 24 hours
      userProfile: 4 * 60 * 60,     // 4 hours
      refreshToken: 7 * 24 * 60 * 60, // 7 days
      otp: 5 * 60,                  // 5 minutes
      emailVerification: 24 * 60 * 60, // 24 hours
      passwordReset: 30 * 60,       // 30 minutes
      failedAttempts: 15 * 60,      // 15 minutes
      userPermissions: 2 * 60 * 60, // 2 hours
    };
  }

  /**
   * Session Management
   */
  async setSession(userId, sessionData) {
    const key = this.generateKey('sessions', userId);
    const data = {
      ...sessionData,
      userId,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.session);
  }

  async getSession(userId) {
    const key = this.generateKey('sessions', userId);
    const session = await this.get(key);
    
    if (session) {
      // Update last accessed time
      session.lastAccessed = new Date().toISOString();
      await this.set(key, session, this.ttl.session);
    }
    
    return session;
  }

  async deleteSession(userId) {
    const key = this.generateKey('sessions', userId);
    return await this.del(key);
  }

  async extendSession(userId, additionalTime = 3600) {
    const key = this.generateKey('sessions', userId);
    const currentTTL = await this.ttl(key);
    
    if (currentTTL > 0) {
      return await this.expire(key, currentTTL + additionalTime);
    }
    
    return false;
  }

  /**
   * User Profile Caching
   */
  async cacheUserProfile(userId, profileData) {
    const key = this.generateKey('profiles', userId);
    return await this.set(key, profileData, this.ttl.userProfile);
  }

  async getUserProfile(userId) {
    const key = this.generateKey('profiles', userId);
    return await this.get(key);
  }

  async invalidateUserProfile(userId) {
    const key = this.generateKey('profiles', userId);
    return await this.del(key);
  }

  /**
   * Refresh Token Management
   */
  async storeRefreshToken(userId, tokenHash, expiresAt) {
    const key = this.generateKey('refresh_tokens', userId, tokenHash);
    const data = {
      userId,
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.refreshToken);
  }

  async validateRefreshToken(userId, tokenHash) {
    const key = this.generateKey('refresh_tokens', userId, tokenHash);
    return await this.get(key);
  }

  async revokeRefreshToken(userId, tokenHash) {
    const key = this.generateKey('refresh_tokens', userId, tokenHash);
    return await this.del(key);
  }

  async revokeAllRefreshTokens(userId) {
    const pattern = this.generateKey('refresh_tokens', userId, '*');
    return await this.delPattern(pattern);
  }

  /**
   * OTP Management
   */
  async setOTP(identifier, otp, type = 'general') {
    const key = this.generateKey('otp', type, identifier);
    const data = {
      otp,
      identifier,
      type,
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    
    return await this.set(key, data, this.ttl.otp);
  }

  async verifyOTP(identifier, otp, type = 'general') {
    const key = this.generateKey('otp', type, identifier);
    const otpData = await this.get(key);
    
    if (!otpData) {
      return { valid: false, reason: 'OTP not found or expired' };
    }

    // Increment attempt counter
    otpData.attempts = (otpData.attempts || 0) + 1;
    
    if (otpData.attempts > 3) {
      await this.del(key);
      return { valid: false, reason: 'Too many attempts' };
    }

    if (otpData.otp !== otp) {
      await this.set(key, otpData, this.ttl.otp);
      return { valid: false, reason: 'Invalid OTP', attemptsLeft: 3 - otpData.attempts };
    }

    // OTP is valid, delete it
    await this.del(key);
    return { valid: true };
  }

  /**
   * Email Verification
   */
  async setEmailVerificationToken(userId, token) {
    const key = this.generateKey('email_verification', userId);
    const data = {
      token,
      userId,
      createdAt: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.emailVerification);
  }

  async getEmailVerificationToken(userId) {
    const key = this.generateKey('email_verification', userId);
    return await this.get(key);
  }

  async deleteEmailVerificationToken(userId) {
    const key = this.generateKey('email_verification', userId);
    return await this.del(key);
  }

  /**
   * Password Reset
   */
  async setPasswordResetToken(userId, tokenHash) {
    const key = this.generateKey('password_reset', userId);
    const data = {
      tokenHash,
      userId,
      createdAt: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.passwordReset);
  }

  async getPasswordResetToken(userId) {
    const key = this.generateKey('password_reset', userId);
    return await this.get(key);
  }

  async deletePasswordResetToken(userId) {
    const key = this.generateKey('password_reset', userId);
    return await this.del(key);
  }

  /**
   * Failed Login Attempts
   */
  async incrementFailedAttempts(identifier) {
    const key = this.generateKey('failed_attempts', identifier);
    const attempts = await this.incr(key, 1);
    
    if (attempts === 1) {
      // Set TTL on first attempt
      await this.expire(key, this.ttl.failedAttempts);
    }
    
    return attempts;
  }

  async getFailedAttempts(identifier) {
    const key = this.generateKey('failed_attempts', identifier);
    const attempts = await this.get(key);
    return attempts || 0;
  }

  async clearFailedAttempts(identifier) {
    const key = this.generateKey('failed_attempts', identifier);
    return await this.del(key);
  }

  /**
   * User Permissions Caching
   */
  async cacheUserPermissions(userId, permissions) {
    const key = this.generateKey('permissions', userId);
    return await this.set(key, permissions, this.ttl.userPermissions);
  }

  async getUserPermissions(userId) {
    const key = this.generateKey('permissions', userId);
    return await this.get(key);
  }

  async invalidateUserPermissions(userId) {
    const key = this.generateKey('permissions', userId);
    return await this.del(key);
  }

  /**
   * Rate Limiting
   */
  async checkRateLimit(identifier, maxRequests, windowMs) {
    const key = this.generateKey('rate_limit', identifier);
    const windowSeconds = Math.ceil(windowMs / 1000);
    
    const current = await this.incr(key, 1);
    
    if (current === 1) {
      await this.expire(key, windowSeconds);
    }
    
    const ttl = await this.ttl(key);
    const resetTime = Date.now() + (ttl * 1000);
    
    return {
      attempts: current,
      remaining: Math.max(0, maxRequests - current),
      resetTime,
      blocked: current > maxRequests
    };
  }

  /**
   * Active Users Tracking
   */
  async trackActiveUser(userId) {
    const key = this.generateKey('active_users', 'current');
    const timestamp = Date.now();
    
    // Add user to active users set with score as timestamp
    await this.client.zAdd(key, { score: timestamp, value: userId });
    
    // Remove users inactive for more than 30 minutes
    const cutoff = timestamp - (30 * 60 * 1000);
    await this.client.zRemRangeByScore(key, 0, cutoff);
    
    return true;
  }

  async getActiveUsersCount() {
    const key = this.generateKey('active_users', 'current');
    return await this.client.zCard(key);
  }

  /**
   * Cache Invalidation Patterns
   */
  async invalidateUserCache(userId) {
    const patterns = [
      this.generateKey('sessions', userId),
      this.generateKey('profiles', userId),
      this.generateKey('permissions', userId),
      this.generateKey('refresh_tokens', userId, '*'),
      this.generateKey('email_verification', userId),
      this.generateKey('password_reset', userId)
    ];

    let deletedCount = 0;
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        deletedCount += await this.delPattern(pattern);
      } else {
        const deleted = await this.del(pattern);
        if (deleted) deletedCount++;
      }
    }

    logger.info(`Invalidated ${deletedCount} cache entries for user ${userId}`);
    return deletedCount;
  }

  /**
   * Bulk Operations
   */
  async cacheMultipleUsers(users) {
    const pipeline = this.client.multi();
    
    for (const user of users) {
      const key = this.generateKey('profiles', user.id);
      pipeline.setEx(key, this.ttl.userProfile, JSON.stringify(user));
    }
    
    await pipeline.exec();
    return users.length;
  }

  /**
   * Health Check
   */
  async healthCheck() {
    try {
      const testKey = this.generateKey('health', 'test');
      const testValue = { timestamp: Date.now() };
      
      await this.set(testKey, testValue, 60);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        testPassed: retrieved && retrieved.timestamp === testValue.timestamp
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = AuthCacheService;
