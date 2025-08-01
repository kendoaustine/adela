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
      if (!config.email?.smtp?.auth?.user || !config.email?.smtp?.auth?.pass) {
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
   * Send generic email
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      if (!this.isConfigured) {
        logger.warn('Email service not configured, skipping email send');
        return { success: false, reason: 'Email service not configured' };
      }

      const mailOptions = {
        from: config.email?.from || 'noreply@gasconnect.com',
        to,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: result.messageId
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send email:', {
        error: error.message,
        to,
        subject
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send reorder alert email
   */
  async sendReorderAlert(to, supplierName, alertData) {
    try {
      const subject = `🚨 Low Stock Alert - ${alertData.criticalItems > 0 ? 'CRITICAL' : 'WARNING'}`;
      
      const htmlContent = this.generateReorderAlertTemplate(supplierName, alertData);
      const textContent = this.generateReorderAlertText(supplierName, alertData);

      return await this.sendEmail({
        to,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      logger.error('Failed to send reorder alert email:', {
        error: error.message,
        to,
        supplierName
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Generate reorder alert HTML template
   */
  generateReorderAlertTemplate(supplierName, alertData) {
    const criticalSection = alertData.criticalItems > 0 ? `
      <div style="background: #fee; border: 2px solid #f00; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3 style="color: #d00; margin: 0;">🚨 CRITICAL: ${alertData.criticalItems} items out of stock!</h3>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Low Stock Alert - ${supplierName}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">GasConnect - Low Stock Alert</h1>
            <p style="margin: 5px 0 0 0; color: #666;">Supplier: ${supplierName}</p>
          </div>
          
          ${criticalSection}
          
          <div style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #e74c3c; margin-top: 0;">Inventory Alert Summary</h2>
            <p>You have <strong>${alertData.totalLowStockItems}</strong> items that need immediate restocking:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background: #f8f9fa;">
                  <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Gas Type</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Size</th>
                  <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Available</th>
                  <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Reorder Level</th>
                  <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${alertData.items.map(item => `
                  <tr>
                    <td style="padding: 12px; border: 1px solid #ddd;">${item.gasTypeName}</td>
                    <td style="padding: 12px; border: 1px solid #ddd;">${item.cylinderSize}</td>
                    <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">${item.quantityAvailable}</td>
                    <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">${item.reorderLevel}</td>
                    <td style="padding: 12px; text-align: center; border: 1px solid #ddd;">
                      <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; background: ${
                        item.urgencyLevel === 'critical' ? '#d32f2f' : 
                        item.urgencyLevel === 'high' ? '#f57c00' : 
                        item.urgencyLevel === 'medium' ? '#fbc02d' : '#689f38'
                      };">
                        ${item.urgencyLevel.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1976d2;">📋 Recommended Actions:</h3>
              <ul style="margin: 0; padding-left: 20px;">
                ${alertData.criticalItems > 0 ? '<li style="color: #d32f2f; font-weight: bold;">Immediately restock critical items to avoid order fulfillment issues</li>' : ''}
                <li>Review and update reorder levels if necessary</li>
                <li>Consider bulk purchasing for frequently low-stock items</li>
                <li>Set up automatic reorder notifications for better inventory management</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${config.app?.frontendUrl || 'https://gasconnect.com'}/supplier/inventory" 
                 style="background: #2196f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Manage Inventory
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding: 20px; color: #666; font-size: 14px;">
            <p>This alert was generated automatically by GasConnect's inventory monitoring system.</p>
            <p><em>Generated at ${new Date(alertData.timestamp).toLocaleString()}</em></p>
            <p>© 2024 GasConnect. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate reorder alert text version
   */
  generateReorderAlertText(supplierName, alertData) {
    return `
GasConnect - Low Stock Alert
Supplier: ${supplierName}

${alertData.criticalItems > 0 ? `🚨 CRITICAL: ${alertData.criticalItems} items out of stock!\n` : ''}

INVENTORY ALERT SUMMARY
You have ${alertData.totalLowStockItems} items that need immediate restocking:

${alertData.items.map(item => 
  `• ${item.gasTypeName} ${item.cylinderSize} - Available: ${item.quantityAvailable}, Reorder: ${item.reorderLevel} (${item.urgencyLevel.toUpperCase()})`
).join('\n')}

RECOMMENDED ACTIONS:
${alertData.criticalItems > 0 ? '• Immediately restock critical items to avoid order fulfillment issues\n' : ''}• Review and update reorder levels if necessary
• Consider bulk purchasing for frequently low-stock items
• Set up automatic reorder notifications for better inventory management

Manage your inventory: ${config.app?.frontendUrl || 'https://gasconnect.com'}/supplier/inventory

Generated at ${new Date(alertData.timestamp).toLocaleString()}
© 2024 GasConnect. All rights reserved.
    `.trim();
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
