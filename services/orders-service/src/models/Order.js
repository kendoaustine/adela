const { query, transaction } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

class Order {
  constructor(data) {
    this.id = data.id;
    this.orderNumber = data.order_number;
    this.userId = data.user_id;
    this.supplierId = data.supplier_id;
    this.deliveryAddressId = data.delivery_address_id;
    this.orderType = data.order_type;
    this.status = data.status;
    this.priority = data.priority;
    this.subtotal = parseFloat(data.subtotal);
    this.taxAmount = parseFloat(data.tax_amount);
    this.deliveryFee = parseFloat(data.delivery_fee);
    this.totalAmount = parseFloat(data.total_amount);
    this.currency = data.currency;
    this.specialInstructions = data.special_instructions;
    this.emergencyContactPhone = data.emergency_contact_phone;
    this.scheduledDeliveryDate = data.scheduled_delivery_date;
    this.deliveredAt = data.delivered_at;
    this.cancelledAt = data.cancelled_at;
    this.cancellationReason = data.cancellation_reason;
    this.recurringConfig = data.recurring_config;
    this.parentOrderId = data.parent_order_id;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  /**
   * Generate unique order number
   */
  static generateOrderNumber() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${config.orders.orderNumberPrefix}${timestamp}${random}`.toUpperCase();
  }

  /**
   * Create a new order
   */
  static async create(orderData) {
    const {
      userId,
      supplierId,
      deliveryAddressId,
      orderType = 'regular',
      priority = 'normal',
      items,
      specialInstructions,
      emergencyContactPhone,
      scheduledDeliveryDate,
      recurringConfig
    } = orderData;

    return await transaction(async (trx) => {
      try {
        const orderId = uuidv4();
        const orderNumber = this.generateOrderNumber();

        // Calculate totals
        let subtotal = 0;
        for (const item of items) {
          subtotal += item.quantity * item.unitPrice;
        }

        const taxAmount = subtotal * 0.075; // 7.5% VAT
        const deliveryFee = await this.calculateDeliveryFee(supplierId, deliveryAddressId, orderType);
        const totalAmount = subtotal + taxAmount + deliveryFee;

        // Create order
        const orderResult = await trx(
          `INSERT INTO orders.orders (
            id, order_number, user_id, supplier_id, delivery_address_id,
            order_type, status, priority, subtotal, tax_amount, delivery_fee,
            total_amount, special_instructions, emergency_contact_phone,
            scheduled_delivery_date, recurring_config
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *`,
          [
            orderId, orderNumber, userId, supplierId, deliveryAddressId,
            orderType, 'pending', priority, subtotal, taxAmount, deliveryFee,
            totalAmount, specialInstructions, emergencyContactPhone,
            scheduledDeliveryDate, recurringConfig ? JSON.stringify(recurringConfig) : null
          ]
        );

        // Create order items
        for (const item of items) {
          await trx(
            `INSERT INTO orders.order_items (
              order_id, gas_type_id, quantity, unit_price, total_price, cylinder_size, special_requirements
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              orderId, item.gasTypeId, item.quantity, item.unitPrice,
              item.quantity * item.unitPrice, item.cylinderSize, item.specialRequirements
            ]
          );
        }

        // Create initial status history
        await trx(
          `INSERT INTO orders.order_status_history (order_id, new_status, reason)
           VALUES ($1, $2, $3)`,
          [orderId, 'pending', 'Order created']
        );

        logger.info('Order created', { orderId, orderNumber, userId, supplierId });
        return new Order(orderResult.rows[0]);
      } catch (error) {
        logger.error('Failed to create order:', error);
        throw error;
      }
    });
  }

  /**
   * Calculate delivery fee based on distance and order type
   */
  static async calculateDeliveryFee(supplierId, deliveryAddressId, orderType) {
    try {
      // Get supplier and delivery addresses
      const result = await query(
        `SELECT 
          sa.latitude as supplier_lat, sa.longitude as supplier_lng,
          da.latitude as delivery_lat, da.longitude as delivery_lng
         FROM auth.addresses sa
         JOIN auth.addresses da ON da.id = $2
         WHERE sa.user_id = $1 AND sa.is_default = true`,
        [supplierId, deliveryAddressId]
      );

      if (result.rows.length === 0) {
        return 2000; // Default delivery fee
      }

      const { supplier_lat, supplier_lng, delivery_lat, delivery_lng } = result.rows[0];
      
      // Calculate distance using Haversine formula
      const distance = this.calculateDistance(supplier_lat, supplier_lng, delivery_lat, delivery_lng);
      
      // Base delivery fee calculation
      let deliveryFee = Math.max(1000, distance * 50); // Minimum 1000, 50 per km
      
      // Apply emergency surcharge
      if (orderType === 'emergency_sos') {
        deliveryFee *= config.orders.emergencyPriorityMultiplier;
      }

      return Math.round(deliveryFee);
    } catch (error) {
      logger.error('Failed to calculate delivery fee:', error);
      return 2000; // Default fallback
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  static toRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  /**
   * Find order by ID
   */
  static async findById(id) {
    try {
      const result = await query(
        'SELECT * FROM orders.orders WHERE id = $1',
        [id]
      );
      
      return result.rows.length > 0 ? new Order(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to find order by ID:', error);
      throw error;
    }
  }

  /**
   * Find order by order number
   */
  static async findByOrderNumber(orderNumber) {
    try {
      const result = await query(
        'SELECT * FROM orders.orders WHERE order_number = $1',
        [orderNumber]
      );
      
      return result.rows.length > 0 ? new Order(result.rows[0]) : null;
    } catch (error) {
      logger.error('Failed to find order by order number:', error);
      throw error;
    }
  }

  /**
   * Find orders by user ID
   */
  static async findByUserId(userId, options = {}) {
    try {
      const { limit = 20, offset = 0, status, orderType } = options;
      
      let whereClause = 'WHERE user_id = $1';
      const params = [userId];
      
      if (status) {
        whereClause += ' AND status = $' + (params.length + 1);
        params.push(status);
      }
      
      if (orderType) {
        whereClause += ' AND order_type = $' + (params.length + 1);
        params.push(orderType);
      }
      
      const result = await query(
        `SELECT * FROM orders.orders 
         ${whereClause}
         ORDER BY created_at DESC 
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      
      return result.rows.map(row => new Order(row));
    } catch (error) {
      logger.error('Failed to find orders by user ID:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateStatus(newStatus, reason = null, changedBy = null) {
    try {
      await transaction(async (trx) => {
        const previousStatus = this.status;
        
        // Update order status
        await trx(
          `UPDATE orders.orders 
           SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, this.id]
        );

        // Add to status history
        await trx(
          `INSERT INTO orders.order_status_history (order_id, previous_status, new_status, changed_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [this.id, previousStatus, newStatus, changedBy, reason]
        );

        this.status = newStatus;
        this.updatedAt = new Date();
        
        logger.info('Order status updated', { 
          orderId: this.id, 
          previousStatus, 
          newStatus, 
          reason 
        });
      });
    } catch (error) {
      logger.error('Failed to update order status:', error);
      throw error;
    }
  }

  /**
   * Cancel order
   */
  async cancel(reason, cancelledBy = null) {
    try {
      if (this.status === 'delivered' || this.status === 'cancelled') {
        throw new Error('Cannot cancel order in current status');
      }

      await query(
        `UPDATE orders.orders 
         SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, 
             cancellation_reason = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [reason, this.id]
      );

      await this.updateStatus('cancelled', reason, cancelledBy);
      
      this.status = 'cancelled';
      this.cancelledAt = new Date();
      this.cancellationReason = reason;
      
      logger.info('Order cancelled', { orderId: this.id, reason });
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      throw error;
    }
  }

  /**
   * Get order items
   */
  async getItems() {
    try {
      const result = await query(
        `SELECT oi.*, gt.name as gas_type_name, gt.category as gas_category
         FROM orders.order_items oi
         JOIN orders.gas_types gt ON oi.gas_type_id = gt.id
         WHERE oi.order_id = $1
         ORDER BY oi.created_at`,
        [this.id]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get order items:', error);
      throw error;
    }
  }

  /**
   * Get delivery tracking info
   */
  async getDeliveryTracking() {
    try {
      const result = await query(
        'SELECT * FROM orders.delivery_tracking WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [this.id]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Failed to get delivery tracking:', error);
      throw error;
    }
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      orderNumber: this.orderNumber,
      userId: this.userId,
      supplierId: this.supplierId,
      deliveryAddressId: this.deliveryAddressId,
      orderType: this.orderType,
      status: this.status,
      priority: this.priority,
      subtotal: this.subtotal,
      taxAmount: this.taxAmount,
      deliveryFee: this.deliveryFee,
      totalAmount: this.totalAmount,
      currency: this.currency,
      specialInstructions: this.specialInstructions,
      emergencyContactPhone: this.emergencyContactPhone,
      scheduledDeliveryDate: this.scheduledDeliveryDate,
      deliveredAt: this.deliveredAt,
      cancelledAt: this.cancelledAt,
      cancellationReason: this.cancellationReason,
      recurringConfig: this.recurringConfig,
      parentOrderId: this.parentOrderId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = Order;
