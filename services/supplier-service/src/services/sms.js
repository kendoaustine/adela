const config = require('../config');
const logger = require('../utils/logger');

class SMSService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.provider = config.sms?.provider || 'twilio';
    this.phoneNumber = config.sms?.twilio?.phoneNumber;
    this.isRealTwilio = false;
    this.initialize();
  }

  /**
   * Initialize SMS service
   */
  initialize() {
    if (this.provider === 'twilio') {
      this.initializeTwilio();
    } else {
      logger.warn('No SMS provider configured');
    }
  }

  /**
   * Initialize Twilio SMS service
   */
  initializeTwilio() {
    try {
      const { accountSid, authToken, phoneNumber } = config.sms?.twilio || {};
      
      if (!accountSid || !authToken || !phoneNumber) {
        logger.warn('Twilio SMS service not configured - credentials missing');
        return;
      }

      // Try to initialize real Twilio client
      try {
        const twilio = require('twilio');
        this.client = twilio(accountSid, authToken);
        this.isRealTwilio = true;
        this.isConfigured = true;
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
        this.isConfigured = true;
      }

      this.phoneNumber = phoneNumber;
    } catch (error) {
      logger.error('Failed to initialize Twilio SMS service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Send SMS message
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
          provider: 'twilio',
          isSimulated: !this.isRealTwilio
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
   * Send reorder alert SMS for critical items
   */
  async sendReorderAlertSMS(phoneNumber, supplierName, criticalItems) {
    try {
      if (!this.isConfigured) {
        logger.warn('SMS service not configured, skipping reorder alert SMS');
        return { success: false, reason: 'SMS service not configured' };
      }

      const itemsList = criticalItems.map(item => `${item.gasTypeName} ${item.cylinderSize}`).join(', ');
      const message = `🚨 CRITICAL STOCK ALERT: ${criticalItems.length} items out of stock! Items: ${itemsList}. Restock immediately to avoid order issues. - GasConnect`;

      const result = await this.sendSMS(phoneNumber, message);
      
      if (result.success) {
        logger.info('Reorder alert SMS sent successfully', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          supplierName,
          criticalItemCount: criticalItems.length,
          messageId: result.messageId,
          isSimulated: result.isSimulated
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send reorder alert SMS:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        supplierName
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send delivery notification SMS
   */
  async sendDeliveryNotification(phoneNumber, customerName, estimatedArrival) {
    try {
      if (!this.isConfigured) {
        logger.warn('SMS service not configured, skipping delivery notification');
        return { success: false, reason: 'SMS service not configured' };
      }

      const message = `Hi ${customerName}, your gas delivery is on the way! Estimated arrival: ${estimatedArrival}. Our driver will contact you shortly. - GasConnect`;

      const result = await this.sendSMS(phoneNumber, message);
      
      if (result.success) {
        logger.info('Delivery notification SMS sent successfully', {
          phoneNumber: this.maskPhoneNumber(phoneNumber),
          customerName,
          estimatedArrival,
          messageId: result.messageId
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send delivery notification SMS:', {
        error: error.message,
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        customerName
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add + if not present
    if (!phoneNumber.startsWith('+')) {
      // Assume Nigerian number if no country code
      if (cleaned.length === 11 && cleaned.startsWith('0')) {
        cleaned = '234' + cleaned.substring(1); // Remove leading 0 and add Nigeria code
      } else if (cleaned.length === 10) {
        cleaned = '234' + cleaned; // Add Nigeria code
      }
      cleaned = '+' + cleaned;
    } else {
      cleaned = phoneNumber;
    }
    
    return cleaned;
  }

  /**
   * Mask phone number for logging
   */
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) {
      return '****';
    }
    
    const formatted = this.formatPhoneNumber(phoneNumber);
    const visiblePart = formatted.slice(-4);
    const maskedPart = '*'.repeat(Math.max(0, formatted.length - 4));
    
    return maskedPart + visiblePart;
  }

  /**
   * Test SMS configuration
   */
  async testConnection() {
    try {
      if (!this.isConfigured) {
        return { success: false, message: 'SMS service not configured' };
      }

      // For Twilio, we can't really test without sending a message
      // So we'll just verify the configuration
      if (this.provider === 'twilio' && this.client && this.phoneNumber) {
        return { 
          success: true, 
          message: `SMS service configured with ${this.provider}`,
          isSimulated: !this.isRealTwilio,
          phoneNumber: this.maskPhoneNumber(this.phoneNumber)
        };
      }

      return { success: false, message: 'SMS service configuration incomplete' };
    } catch (error) {
      logger.error('SMS service connection test failed:', error);
      return { success: false, message: error.message };
    }
  }
}

// Create singleton instance
const smsService = new SMSService();

module.exports = smsService;
