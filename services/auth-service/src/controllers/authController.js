const User = require('../models/User');
const JWTService = require('../services/jwt');
const { sessionService, otpService } = require('../services/redis');
const { eventService } = require('../services/rabbitmq');
const logger = require('../utils/logger');
const { 
  ValidationError, 
  AuthenticationError, 
  ConflictError,
  NotFoundError 
} = require('../middleware/errorHandler');

class AuthController {
  /**
   * Register a new user
   */
  static async register(req, res) {
    const { email, phone, password, role, firstName, lastName, businessName } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmailOrPhone(email) || await User.findByEmailOrPhone(phone);
    if (existingUser) {
      throw new ConflictError('User with this email or phone already exists');
    }

    // Create user
    const user = await User.create({ email, phone, password, role });

    // Create profile
    const { query } = require('../database/connection');
    await query(
      `INSERT INTO auth.profiles (user_id, first_name, last_name, business_name)
       VALUES ($1, $2, $3, $4)`,
      [user.id, firstName, lastName, businessName || null]
    );

    // Generate tokens
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    };
    
    const tokens = await JWTService.generateTokenPair(user, deviceInfo, req.ip);

    // Store session
    await sessionService.setSession(user.id, {
      tokenId: JWTService.decodeToken(tokens.accessToken).payload.jti,
      deviceInfo,
      loginAt: new Date().toISOString(),
    });

    // Publish user created event
    await eventService.userCreated({
      id: user.id,
      email: user.email,
      role: user.role,
      profile: { firstName, lastName, businessName },
    });

    logger.logAuth('user_registered', user.id, { email, role });

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      tokens,
    });
  }

  /**
   * Login user
   */
  static async login(req, res) {
    const { identifier, password } = req.body; // identifier can be email or phone

    // Find user
    const user = await User.findByEmailOrPhone(identifier);
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check if account is locked
    if (user.isLocked()) {
      throw new AuthenticationError('Account is temporarily locked due to too many failed attempts');
    }

    // Verify password
    const isValidPassword = await user.verifyPassword(password);
    if (!isValidPassword) {
      await user.incrementFailedLoginAttempts();
      throw new AuthenticationError('Invalid credentials');
    }

    // Update last login
    await user.updateLastLogin();

    // Generate tokens
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    };
    
    const tokens = await JWTService.generateTokenPair(user, deviceInfo, req.ip);

    // Store session
    await sessionService.setSession(user.id, {
      tokenId: JWTService.decodeToken(tokens.accessToken).payload.jti,
      deviceInfo,
      loginAt: new Date().toISOString(),
    });

    // Publish login event
    await eventService.userLogin(user.id, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    logger.logAuth('user_login', user.id, { email: user.email });

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      tokens,
    });
  }

  /**
   * Refresh access token
   */
  static async refresh(req, res) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    };

    const tokens = await JWTService.refreshAccessToken(refreshToken, deviceInfo, req.ip);

    // Update session
    const decoded = JWTService.decodeToken(tokens.accessToken);
    await sessionService.setSession(decoded.sub, {
      tokenId: decoded.jti,
      deviceInfo,
      refreshedAt: new Date().toISOString(),
    });

    logger.logAuth('token_refreshed', decoded.sub);

    res.json({
      message: 'Token refreshed successfully',
      tokens,
    });
  }

  /**
   * Logout user
   */
  static async logout(req, res) {
    const { refreshToken } = req.body;
    const userId = req.user.id;

    // Revoke refresh token if provided
    if (refreshToken) {
      const crypto = require('crypto');
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await JWTService.revokeRefreshToken(userId, tokenHash);
    }

    // Clear session
    await sessionService.deleteSession(userId);

    // Publish logout event
    await eventService.userLogout(userId);

    logger.logAuth('user_logout', userId);

    res.json({
      message: 'Logout successful',
    });
  }

  /**
   * Logout from all devices
   */
  static async logoutAll(req, res) {
    const userId = req.user.id;

    // Revoke all refresh tokens
    await JWTService.revokeAllRefreshTokens(userId);

    // Clear session
    await sessionService.deleteSession(userId);

    logger.logAuth('user_logout_all', userId);

    res.json({
      message: 'Logged out from all devices successfully',
    });
  }

  /**
   * Get current user profile
   */
  static async me(req, res) {
    const user = req.user;
    const profile = await user.getProfile();
    const addresses = await user.getAddresses();

    res.json({
      user: user.toJSON(),
      profile,
      addresses,
    });
  }

  /**
   * Send email verification
   */
  static async sendEmailVerification(req, res) {
    const user = req.user;

    if (user.emailVerifiedAt) {
      throw new ValidationError('Email is already verified');
    }

    // Generate verification token
    const verificationToken = require('crypto').randomBytes(32).toString('hex');
    
    // Store token in Redis with 24 hour expiry
    const { cacheService } = require('../services/redis');
    await cacheService.set(`email_verification:${user.id}`, verificationToken, 24 * 60 * 60);

    // TODO: Send email with verification link
    // For now, we'll just return the token (in production, this should be sent via email)
    
    logger.logAuth('email_verification_sent', user.id);

    res.json({
      message: 'Email verification sent',
      // Remove this in production
      verificationToken: verificationToken,
    });
  }

  /**
   * Verify email
   */
  static async verifyEmail(req, res) {
    const { token } = req.body;
    const user = req.user;

    if (user.emailVerifiedAt) {
      throw new ValidationError('Email is already verified');
    }

    // Verify token
    const { cacheService } = require('../services/redis');
    const storedToken = await cacheService.get(`email_verification:${user.id}`);
    
    if (!storedToken || storedToken !== token) {
      throw new ValidationError('Invalid or expired verification token');
    }

    // Mark email as verified
    await user.verifyEmail();

    // Delete verification token
    await cacheService.del(`email_verification:${user.id}`);

    // Publish verification event
    await eventService.userVerified(user.id, 'email');

    logger.logAuth('email_verified', user.id);

    res.json({
      message: 'Email verified successfully',
      user: user.toJSON(),
    });
  }

  /**
   * Send phone verification OTP
   */
  static async sendPhoneVerification(req, res) {
    const user = req.user;

    if (user.phoneVerifiedAt) {
      throw new ValidationError('Phone is already verified');
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP
    await otpService.setOTP(user.phone, otp, 'phone_verification');

    // TODO: Send SMS with OTP
    // For now, we'll just return the OTP (in production, this should be sent via SMS)
    
    logger.logAuth('phone_verification_sent', user.id, { phone: user.phone });

    res.json({
      message: 'Phone verification OTP sent',
      // Remove this in production
      otp: otp,
    });
  }

  /**
   * Verify phone with OTP
   */
  static async verifyPhone(req, res) {
    const { otp } = req.body;
    const user = req.user;

    if (user.phoneVerifiedAt) {
      throw new ValidationError('Phone is already verified');
    }

    // Verify OTP
    const isValidOTP = await otpService.verifyOTP(user.phone, otp, 'phone_verification');
    if (!isValidOTP) {
      throw new ValidationError('Invalid or expired OTP');
    }

    // Mark phone as verified
    await user.verifyPhone();

    // Publish verification event
    await eventService.userVerified(user.id, 'phone');

    logger.logAuth('phone_verified', user.id);

    res.json({
      message: 'Phone verified successfully',
      user: user.toJSON(),
    });
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(req, res) {
    const { identifier } = req.body; // email or phone

    const user = await User.findByEmailOrPhone(identifier);
    if (!user) {
      // Don't reveal if user exists or not
      return res.json({
        message: 'If the account exists, a password reset link has been sent',
      });
    }

    // Generate reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const hashedToken = require('crypto').createHash('sha256').update(resetToken).digest('hex');
    
    // Store reset token in database
    const { query } = require('../database/connection');
    await query(
      `INSERT INTO auth.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
      [user.id, hashedToken]
    );

    // TODO: Send email/SMS with reset link
    
    // Publish password reset event
    await eventService.passwordReset(user.id, user.email);

    logger.logAuth('password_reset_requested', user.id);

    res.json({
      message: 'If the account exists, a password reset link has been sent',
      // Remove this in production
      resetToken: resetToken,
    });
  }

  /**
   * Reset password
   */
  static async resetPassword(req, res) {
    const { token, newPassword } = req.body;

    // Hash token
    const hashedToken = require('crypto').createHash('sha256').update(token).digest('hex');

    // Find valid reset token
    const { query } = require('../database/connection');
    const result = await query(
      `SELECT user_id FROM auth.password_reset_tokens 
       WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP AND is_used = false`,
      [hashedToken]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const userId = result.rows[0].user_id;
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Update password
    await user.updatePassword(newPassword);

    // Mark token as used
    await query(
      `UPDATE auth.password_reset_tokens 
       SET is_used = true 
       WHERE token_hash = $1`,
      [hashedToken]
    );

    // Revoke all refresh tokens for security
    await JWTService.revokeAllRefreshTokens(userId);

    logger.logAuth('password_reset_completed', userId);

    res.json({
      message: 'Password reset successfully',
    });
  }
}

module.exports = AuthController;
