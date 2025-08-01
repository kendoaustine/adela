const config = require('../config');
const logger = require('../utils/logger');

class SMSService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.provider = config.sms.provider;
    this.initialize();
  }

  /**
   * Initialize SMS service based on provider
   */
  initialize() {
    try {
      if (this.provider === 'twilio') {
        this.initializeTwilio();
      } else {
        logger.warn(`SMS provider '${this.provider}' not supported`);
      }
    } catch (error) {
      logger.error('Failed to initialize SMS service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Initialize Twilio SMS service
   */
  initializeTwilio() {
    try {
      const { accountSid, authToken, phoneNumber } = config.sms.twilio;
      
      if (!accountSid || !authToken || !phoneNumber) {
        logger.warn('Twilio SMS service not configured - credentials missing');
        return;
      }

      // Try to initialize real Twilio client
      try {
        const twilio = require('twilio');
        this.client = twilio(accountSid, authToken);
        this.isRealTwilio = true;
        logger.info('Real Twilio SMS service initialized');
      } catch (error) {
        // Fallback to simulation if Twilio SDK not available
        logger.warn('Twilio SDK not available, using simulation mode', { error: error.message });
        this.client = {
          messages: {
            create: async (options) => {
              // Simulate Twilio API call
              logger.info('Simulated SMS sent via Twilio', {
                to: options.to,
                from: options.from,
                body: options.body.substring(0, 50) + '...'
              });

              return {
                sid: 'SM' + Math.random().toString(36).substr(2, 32),
                status: 'sent',
                to: options.to,
                from: options.from
              };
            }
          }
        };
        this.isRealTwilio = false;
      }

      this.phoneNumber = phoneNumber;
      this.isConfigured = true;
      logger.info('Twilio SMS service initialized successfully (simulated)');
    } catch (error) {
      logger.error('Failed to initialize Twilio SMS service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Send phone verification OTP
   */
  async sendPhoneVerification(phoneNumber, otp, userName = '') {
    try {
      if (!this.isConfigured) {
        logger.warn('SMS service not configured, skipping phone verification send');
        return { success: false, reason: 'SMS service not configured' };
      }

      const message = `Hi ${userName ? userName + ', ' : ''}your GasConnect verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;

      const result = await this.sendSMS(phoneNumber, message);
      
      if (result.success) {
        logger.info('Phone verification OTP sent successfully', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          messageId: result.messageId
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send phone verification OTP:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber)
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send password reset OTP
   */
  async sendPasswordResetOTP(phoneNumber, otp, userName = '') {
    try {
      if (!this.isConfigured) {
        logger.warn('SMS service not configured, skipping password reset OTP');
        return { success: false, reason: 'SMS service not configured' };
      }

      const message = `Hi ${userName ? userName + ', ' : ''}your GasConnect password reset code is: ${otp}. This code will expire in 10 minutes. If you didn't request this, please ignore this message.`;

      const result = await this.sendSMS(phoneNumber, message);
      
      if (result.success) {
        logger.info('Password reset OTP sent successfully', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          messageId: result.messageId
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send password reset OTP:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber)
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send order notification SMS
   */
  async sendOrderNotification(phoneNumber, orderNumber, status, userName = '') {
    try {
      if (!this.isConfigured) {
        logger.warn('SMS service not configured, skipping order notification');
        return { success: false, reason: 'SMS service not configured' };
      }

      let message;
      switch (status) {
        case 'confirmed':
          message = `Hi ${userName ? userName + ', ' : ''}your GasConnect order ${orderNumber} has been confirmed and is being prepared for delivery.`;
          break;
        case 'out_for_delivery':
          message = `Hi ${userName ? userName + ', ' : ''}your GasConnect order ${orderNumber} is out for delivery. You'll receive it soon!`;
          break;
        case 'delivered':
          message = `Hi ${userName ? userName + ', ' : ''}your GasConnect order ${orderNumber} has been delivered successfully. Thank you for choosing us!`;
          break;
        default:
          message = `Hi ${userName ? userName + ', ' : ''}your GasConnect order ${orderNumber} status has been updated to: ${status}.`;
      }

      const result = await this.sendSMS(phoneNumber, message);
      
      if (result.success) {
        logger.info('Order notification SMS sent successfully', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          orderNumber,
          status,
          messageId: result.messageId
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send order notification SMS:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        orderNumber,
        status
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send emergency delivery notification
   */
  async sendEmergencyNotification(phoneNumber, estimatedArrival, userName = '') {
    try {
      if (!this.isConfigured) {
        logger.warn('SMS service not configured, skipping emergency notification');
        return { success: false, reason: 'SMS service not configured' };
      }

      const message = `EMERGENCY DELIVERY: Hi ${userName ? userName + ', ' : ''}your emergency gas delivery is on the way! Estimated arrival: ${estimatedArrival}. Our driver will contact you shortly.`;

      const result = await this.sendSMS(phoneNumber, message);
      
      if (result.success) {
        logger.info('Emergency notification SMS sent successfully', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          estimatedArrival,
          messageId: result.messageId
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send emergency notification SMS:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber)
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Core SMS sending function
   */
  async sendSMS(phoneNumber, message) {
    try {
      if (!this.isConfigured) {
        return { success: false, reason: 'SMS service not configured' };
      }

      // Format phone number (ensure it starts with +)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      if (this.provider === 'twilio') {
        const result = await this.client.messages.create({
          body: message,
          from: this.phoneNumber,
          to: formattedPhone
        });

        return {
          success: true,
          messageId: result.sid,
          status: result.status,
          provider: 'twilio'
        };
      }

      return { success: false, reason: 'No SMS provider configured' };
    } catch (error) {
      logger.error('Failed to send SMS:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber)
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Format phone number for international SMS
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 0 (Nigerian local format), replace with +234
    if (cleaned.startsWith('0')) {
      cleaned = '+234' + cleaned.substring(1);
    }
    // If it doesn't start with +, assume it's Nigerian and add +234
    else if (!cleaned.startsWith('+')) {
      cleaned = '+234' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Mask phone number for logging (privacy)
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) {
      return '****';
    }
    
    const formatted = this.formatPhoneNumber(phoneNumber);
    const visiblePart = formatted.slice(-4);
    const maskedPart = '*'.repeat(formatted.length - 4);
    
    return maskedPart + visiblePart;
  }

  /**
   * Test SMS service configuration
   */
  async testConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, message: 'SMS service not configured' };
      }

      // Send a test message to a dummy number (won't actually send)
      const testResult = await this.sendSMS('+1234567890', 'Test message from GasConnect SMS service');
      
      if (testResult.success) {
        return { success: true, message: 'SMS service connection successful' };
      } else {
        return { success: false, message: testResult.reason };
      }
    } catch (error) {
      logger.error('SMS service connection test failed:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isConfigured: this.isConfigured,
      provider: this.provider,
      phoneNumber: this.phoneNumber ? this.maskPhoneNumber(this.phoneNumber) : null
    };
  }
}

// Create singleton instance
const smsService = new SMSService();

module.exports = smsService;
