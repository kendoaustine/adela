const { query } = require('../database/connection');
const { publishEvent } = require('./rabbitmq');
const emailService = require('./email');
const smsService = require('./sms');
const logger = require('../utils/logger');

class ReorderAlertService {
  constructor() {
    this.alertThresholds = {
      critical: 0,      // Out of stock
      high: 0.25,       // 25% of reorder level
      medium: 0.5,      // 50% of reorder level
      low: 1.0          // At reorder level
    };
  }

  /**
   * Check all suppliers for low stock items and send alerts
   */
  async checkAndSendReorderAlerts() {
    try {
      logger.info('Starting reorder alert check...');

      // Get all low stock items across all suppliers
      const lowStockResult = await query(`
        SELECT 
          i.*,
          gt.name as gas_type_name,
          gt.description as gas_type_description,
          u.id as supplier_id,
          p.business_name as supplier_name,
          u.email as supplier_email,
          u.phone as supplier_phone,
          sp.business_email,
          sp.business_phone,
          -- Calculate stock ratio and urgency
          (i.quantity_available::float / NULLIF(i.reorder_level, 0)::float) as stock_ratio,
          CASE 
            WHEN i.quantity_available = 0 THEN 'critical'
            WHEN i.quantity_available <= (i.reorder_level * 0.25) THEN 'high'
            WHEN i.quantity_available <= (i.reorder_level * 0.5) THEN 'medium'
            ELSE 'low'
          END as urgency_level
        FROM supplier.inventory i
        JOIN supplier.gas_types gt ON i.gas_type_id = gt.id
        JOIN auth.users u ON i.supplier_id = u.id
        JOIN auth.profiles p ON u.id = p.user_id
        LEFT JOIN auth.supplier_profiles sp ON u.id = sp.user_id
        WHERE i.quantity_available <= i.reorder_level
        AND u.is_active = true
        ORDER BY urgency_level DESC, stock_ratio ASC
      `);

      const lowStockItems = lowStockResult.rows;

      if (lowStockItems.length === 0) {
        logger.info('No low stock items found');
        return { alertsSent: 0, suppliersNotified: 0 };
      }

      // Group by supplier
      const supplierGroups = this.groupBySupplier(lowStockItems);
      let alertsSent = 0;
      let suppliersNotified = 0;

      for (const [supplierId, items] of Object.entries(supplierGroups)) {
        try {
          await this.sendSupplierAlert(supplierId, items);
          alertsSent += items.length;
          suppliersNotified++;
        } catch (error) {
          logger.error('Failed to send alert to supplier:', {
            supplierId,
            error: error.message,
            itemCount: items.length
          });
        }
      }

      // Publish system-wide alert event
      await publishEvent('supplier.events', 'reorder.alerts.sent', {
        eventType: 'reorder.alerts.sent',
        totalLowStockItems: lowStockItems.length,
        alertsSent,
        suppliersNotified,
        urgencyBreakdown: this.getUrgencyBreakdown(lowStockItems),
        timestamp: new Date().toISOString()
      });

      logger.info('Reorder alert check completed', {
        totalLowStockItems: lowStockItems.length,
        alertsSent,
        suppliersNotified
      });

      return { alertsSent, suppliersNotified, lowStockItems: lowStockItems.length };
    } catch (error) {
      logger.error('Failed to check reorder alerts:', error);
      throw error;
    }
  }

  /**
   * Send alert to specific supplier
   */
  async sendSupplierAlert(supplierId, items) {
    const supplier = items[0]; // Get supplier info from first item
    const criticalItems = items.filter(item => item.urgency_level === 'critical');
    const highUrgencyItems = items.filter(item => item.urgency_level === 'high');

    // Prepare alert data
    const alertData = {
      supplierId,
      supplierName: supplier.supplier_name,
      totalLowStockItems: items.length,
      criticalItems: criticalItems.length,
      highUrgencyItems: highUrgencyItems.length,
      items: items.map(item => ({
        gasTypeName: item.gas_type_name,
        cylinderSize: item.cylinder_size,
        quantityAvailable: item.quantity_available,
        reorderLevel: item.reorder_level,
        urgencyLevel: item.urgency_level,
        stockRatio: parseFloat(item.stock_ratio || 0)
      })),
      timestamp: new Date().toISOString()
    };

    // Send email alert
    if (supplier.supplier_email || supplier.business_email) {
      const emailAddress = supplier.business_email || supplier.supplier_email;
      await this.sendEmailAlert(emailAddress, supplier.supplier_name, alertData);
    }

    // Send SMS alert for critical items
    if (criticalItems.length > 0 && (supplier.supplier_phone || supplier.business_phone)) {
      const phoneNumber = supplier.business_phone || supplier.supplier_phone;
      await this.sendSMSAlert(phoneNumber, supplier.supplier_name, criticalItems);
    }

    // Log alert in database
    await this.logAlert(supplierId, alertData);

    logger.info('Supplier alert sent', {
      supplierId,
      supplierName: supplier.supplier_name,
      itemCount: items.length,
      criticalItems: criticalItems.length
    });
  }

  /**
   * Send email alert
   */
  async sendEmailAlert(email, supplierName, alertData) {
    try {
      // Use the new email service's reorder alert method
      const result = await emailService.sendReorderAlert(email, supplierName, alertData);

      if (result.success) {
        logger.info('Reorder alert email sent successfully', {
          email,
          supplierName,
          messageId: result.messageId
        });
      } else {
        logger.warn('Failed to send reorder alert email', {
          email,
          supplierName,
          reason: result.reason
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send email alert:', {
        email,
        supplierName,
        error: error.message
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send SMS alert for critical items
   */
  async sendSMSAlert(phone, supplierName, criticalItems) {
    try {
      // Use the new SMS service's reorder alert method
      const result = await smsService.sendReorderAlertSMS(phone, supplierName, criticalItems);

      if (result.success) {
        logger.info('Reorder alert SMS sent successfully', {
          phone: smsService.maskPhoneNumber(phone),
          supplierName,
          criticalItemCount: criticalItems.length,
          messageId: result.messageId,
          isSimulated: result.isSimulated
        });
      } else {
        logger.warn('Failed to send reorder alert SMS', {
          phone: smsService.maskPhoneNumber(phone),
          supplierName,
          reason: result.reason
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to send SMS alert:', {
        phone: smsService.maskPhoneNumber(phone),
        supplierName,
        error: error.message
      });
      return { success: false, reason: error.message };
    }
  }

  /**
   * Log alert in database
   */
  async logAlert(supplierId, alertData) {
    try {
      await query(`
        INSERT INTO supplier.reorder_alerts (
          supplier_id, alert_type, item_count, critical_items, 
          high_urgency_items, alert_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `, [
        supplierId,
        alertData.criticalItems > 0 ? 'critical' : 'warning',
        alertData.totalLowStockItems,
        alertData.criticalItems,
        alertData.highUrgencyItems,
        JSON.stringify(alertData)
      ]);
    } catch (error) {
      logger.error('Failed to log alert:', {
        supplierId,
        error: error.message
      });
    }
  }

  /**
   * Group items by supplier
   */
  groupBySupplier(items) {
    return items.reduce((groups, item) => {
      const supplierId = item.supplier_id;
      if (!groups[supplierId]) {
        groups[supplierId] = [];
      }
      groups[supplierId].push(item);
      return groups;
    }, {});
  }

  /**
   * Get urgency breakdown
   */
  getUrgencyBreakdown(items) {
    return items.reduce((breakdown, item) => {
      breakdown[item.urgency_level] = (breakdown[item.urgency_level] || 0) + 1;
      return breakdown;
    }, {});
  }

  /**
   * Generate email template
   */
  generateEmailTemplate(supplierName, alertData) {
    const criticalSection = alertData.criticalItems > 0 ? `
      <div style="background: #fee; border: 2px solid #f00; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3 style="color: #d00; margin: 0;">🚨 CRITICAL: ${alertData.criticalItems} items out of stock!</h3>
      </div>
    ` : '';

    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Low Stock Alert - ${supplierName}</h2>
          ${criticalSection}
          <p>You have <strong>${alertData.totalLowStockItems}</strong> items that need restocking:</p>
          <ul>
            ${alertData.items.map(item => `
              <li style="margin: 5px 0;">
                <strong>${item.gasTypeName} ${item.cylinderSize}</strong> - 
                Available: ${item.quantityAvailable}, Reorder Level: ${item.reorderLevel}
                <span style="color: ${item.urgencyLevel === 'critical' ? '#d00' : item.urgencyLevel === 'high' ? '#f80' : '#666'};">
                  (${item.urgencyLevel.toUpperCase()})
                </span>
              </li>
            `).join('')}
          </ul>
          <p>Please restock these items as soon as possible to avoid order fulfillment issues.</p>
          <p><em>Generated at ${new Date(alertData.timestamp).toLocaleString()}</em></p>
        </body>
      </html>
    `;
  }

  /**
   * Generate text alert
   */
  generateTextAlert(supplierName, alertData) {
    return `
Low Stock Alert - ${supplierName}

${alertData.criticalItems > 0 ? `🚨 CRITICAL: ${alertData.criticalItems} items out of stock!\n` : ''}

You have ${alertData.totalLowStockItems} items that need restocking:

${alertData.items.map(item => 
  `• ${item.gasTypeName} ${item.cylinderSize} - Available: ${item.quantityAvailable}, Reorder: ${item.reorderLevel} (${item.urgencyLevel.toUpperCase()})`
).join('\n')}

Please restock these items as soon as possible.

Generated at ${new Date(alertData.timestamp).toLocaleString()}
    `.trim();
  }
}

// Create singleton instance
const reorderAlertService = new ReorderAlertService();

module.exports = reorderAlertService;
