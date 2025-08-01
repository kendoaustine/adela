const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialize();
  }

  /**
   * Initialize email transporter
   */
  initialize() {
    try {
      // Check if email configuration is available
      if (!config.email.smtp.auth.user || !config.email.smtp.auth.pass) {
        logger.warn('Email service not configured - SMTP credentials missing');
        return;
      }

      this.transporter = nodemailer.createTransporter({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        auth: {
          user: config.email.smtp.auth.user,
          pass: config.email.smtp.auth.pass,
        },
        tls: {
          rejectUnauthorized: false // For development only
        }
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(email, verificationToken, userName = '') {
    try {
      if (!this.isConfigured) {
        logger.warn('Email service not configured, skipping email verification send');
        return { success: false, reason: 'Email service not configured' };
      }

      const verificationUrl = `${config.app.frontendUrl}/verify-email?token=${verificationToken}`;
      
      const mailOptions = {
        from: config.email.from,
        to: email,
        subject: 'Verify Your GasConnect Account',
        html: this.getEmailVerificationTemplate(userName, verificationUrl, verificationToken),
        text: `Hi ${userName},\n\nPlease verify your email address by clicking this link: ${verificationUrl}\n\nOr use this verification code: ${verificationToken}\n\nThis link will expire in 24 hours.\n\nBest regards,\nGasConnect Team`
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email verification sent successfully', {
        email,
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send email verification:', {
        error: error.message,
        email
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email, resetToken, userName = '') {
    try {
      if (!this.isConfigured) {
        logger.warn('Email service not configured, skipping password reset email');
        return { success: false, reason: 'Email service not configured' };
      }

      const resetUrl = `${config.app.frontendUrl}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: config.email.from,
        to: email,
        subject: 'Reset Your GasConnect Password',
        html: this.getPasswordResetTemplate(userName, resetUrl, resetToken),
        text: `Hi ${userName},\n\nYou requested a password reset for your GasConnect account.\n\nClick this link to reset your password: ${resetUrl}\n\nOr use this reset code: ${resetToken}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nGasConnect Team`
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Password reset email sent successfully', {
        email,
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send password reset email:', {
        error: error.message,
        email
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email, userName, userRole) {
    try {
      if (!this.isConfigured) {
        logger.warn('Email service not configured, skipping welcome email');
        return { success: false, reason: 'Email service not configured' };
      }

      const mailOptions = {
        from: config.email.from,
        to: email,
        subject: 'Welcome to GasConnect!',
        html: this.getWelcomeTemplate(userName, userRole),
        text: `Hi ${userName},\n\nWelcome to GasConnect! Your account has been created successfully.\n\nAs a ${userRole}, you can now access our platform to manage your gas delivery needs.\n\nPlease verify your email address to get started.\n\nBest regards,\nGasConnect Team`
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Welcome email sent successfully', {
        email,
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send welcome email:', {
        error: error.message,
        email
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Email verification template
   */
  getEmailVerificationTemplate(userName, verificationUrl, token) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your Email - GasConnect</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .code { background: #e5e7eb; padding: 10px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GasConnect</h1>
            <h2>Email Verification</h2>
          </div>
          <div class="content">
            <h3>Hi ${userName || 'there'},</h3>
            <p>Thank you for signing up with GasConnect! Please verify your email address to complete your account setup.</p>
            <p>Click the button below to verify your email:</p>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
            <p>Or copy and paste this verification code:</p>
            <div class="code">${token}</div>
            <p><strong>This verification link will expire in 24 hours.</strong></p>
            <p>If you didn't create a GasConnect account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The GasConnect Team</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Password reset template
   */
  getPasswordResetTemplate(userName, resetUrl, token) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password - GasConnect</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .code { background: #e5e7eb; padding: 10px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>GasConnect</h1>
            <h2>Password Reset</h2>
          </div>
          <div class="content">
            <h3>Hi ${userName || 'there'},</h3>
            <p>You requested a password reset for your GasConnect account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this reset code:</p>
            <div class="code">${token}</div>
            <p><strong>This reset link will expire in 1 hour.</strong></p>
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The GasConnect Team</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Welcome email template
   */
  getWelcomeTemplate(userName, userRole) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to GasConnect!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to GasConnect!</h1>
          </div>
          <div class="content">
            <h3>Hi ${userName || 'there'},</h3>
            <p>Welcome to GasConnect! Your account has been created successfully.</p>
            <p>As a <strong>${userRole}</strong>, you now have access to our platform for managing your gas delivery needs.</p>
            <p>Next steps:</p>
            <ul>
              <li>Verify your email address</li>
              <li>Complete your profile</li>
              <li>Add your delivery addresses</li>
              <li>Start ordering gas cylinders</li>
            </ul>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The GasConnect Team</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Test email configuration
   */
  async testConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, message: 'Email service not configured' };
      }

      await this.transporter.verify();
      return { success: true, message: 'Email service connection successful' };
    } catch (error) {
      logger.error('Email service connection test failed:', error);
      return { success: false, message: error.message };
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
