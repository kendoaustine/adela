const { query } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const axios = require('axios');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');
const config = require('../config');

class OrderController {
  /**
   * Create a new order with comprehensive validation
   */
  static async createOrder(req, res) {
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      items,
      deliveryAddressId,
      deliveryDate,
      deliveryTimeSlot,
      notes,
      isEmergency = false,
      paymentMethodId,
      useWallet = false
    } = req.body;

    try {
      // Start transaction
      await query('BEGIN');

      try {
        // 1. Validate delivery address
        const addressResult = await query(
          'SELECT * FROM auth.addresses WHERE id = $1 AND user_id = $2 AND is_active = true',
          [deliveryAddressId, userId]
        );

        if (addressResult.rows.length === 0) {
          throw new ValidationError('Invalid delivery address');
        }

        const deliveryAddress = addressResult.rows[0];

        // 2. Validate and process order items
        let totalAmount = 0;
        const processedItems = [];
        const supplierInventoryMap = new Map();

        for (const item of items) {
          const { gasTypeId, cylinderSize, quantity } = item;

          // Get gas type information from supplier service
          const gasTypeResult = await query(
            'SELECT * FROM supplier.gas_types WHERE id = $1 AND is_active = true',
            [gasTypeId]
          );

          if (gasTypeResult.rows.length === 0) {
            throw new ValidationError(`Invalid gas type: ${gasTypeId}`);
          }

          const gasType = gasTypeResult.rows[0];

          // Find available suppliers with inventory
          const inventoryResult = await this.findAvailableSuppliers(gasTypeId, cylinderSize, quantity, deliveryAddress);

          if (inventoryResult.length === 0) {
            throw new BusinessLogicError(`No suppliers available for ${gasType.name} ${cylinderSize} (quantity: ${quantity})`);
          }

          // Select best supplier (closest, best price, highest rating)
          const selectedSupplier = this.selectBestSupplier(inventoryResult, isEmergency);

          // Calculate pricing
          const pricing = await this.calculateItemPricing(selectedSupplier.supplierId, gasTypeId, cylinderSize, quantity, userRole);

          const itemTotal = pricing.finalPrice * quantity;
          totalAmount += itemTotal;

          processedItems.push({
            gasTypeId,
            gasTypeName: gasType.name,
            cylinderSize,
            quantity,
            unitPrice: pricing.finalPrice,
            originalPrice: pricing.basePrice,
            discount: pricing.discount,
            totalPrice: itemTotal,
            supplierId: selectedSupplier.supplierId,
            supplierName: selectedSupplier.supplierName,
            inventoryId: selectedSupplier.inventoryId
          });

          // Track inventory reservations by supplier
          if (!supplierInventoryMap.has(selectedSupplier.supplierId)) {
            supplierInventoryMap.set(selectedSupplier.supplierId, []);
          }
          supplierInventoryMap.get(selectedSupplier.supplierId).push({
            inventoryId: selectedSupplier.inventoryId,
            quantity
          });
        }

        // 3. Apply emergency surcharge if applicable
        if (isEmergency) {
          const emergencySurcharge = totalAmount * 0.15; // 15% emergency surcharge
          totalAmount += emergencySurcharge;
        }

        // 4. Calculate delivery fee
        const deliveryFee = await this.calculateDeliveryFee(deliveryAddress, isEmergency);
        totalAmount += deliveryFee;

        // 5. Create order record
        const orderResult = await query(`
          INSERT INTO orders.orders (
            customer_id, customer_role, delivery_address_id, delivery_date, 
            delivery_time_slot, total_amount, delivery_fee, emergency_surcharge,
            status, notes, is_emergency, payment_method_id, use_wallet
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
          RETURNING *
        `, [
          userId, userRole, deliveryAddressId, deliveryDate, deliveryTimeSlot,
          totalAmount, deliveryFee, isEmergency ? totalAmount * 0.15 / 1.15 : 0,
          notes, isEmergency, paymentMethodId, useWallet
        ]);

        const order = orderResult.rows[0];

        // 6. Create order items
        for (const item of processedItems) {
          await query(`
            INSERT INTO orders.order_items (
              order_id, gas_type_id, cylinder_size, quantity, unit_price,
              original_price, discount_amount, total_price, supplier_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            order.id, item.gasTypeId, item.cylinderSize, item.quantity,
            item.unitPrice, item.originalPrice, item.discount, item.totalPrice,
            item.supplierId
          ]);
        }

        // 7. Reserve inventory
        for (const [supplierId, reservations] of supplierInventoryMap) {
          for (const reservation of reservations) {
            await query(
              'UPDATE supplier.inventory SET quantity_available = quantity_available - $1 WHERE id = $2',
              [reservation.quantity, reservation.inventoryId]
            );
          }
        }

        // 8. Create order status history
        await query(`
          INSERT INTO orders.order_status_history (order_id, status, notes, changed_by)
          VALUES ($1, 'pending', 'Order created', $2)
        `, [order.id, userId]);

        await query('COMMIT');

        // 9. Publish order created event
        await publishEvent('orders.events', 'order.created', {
          eventType: 'order.created',
          orderId: order.id,
          customerId: userId,
          customerRole: userRole,
          totalAmount,
          isEmergency,
          suppliers: Array.from(supplierInventoryMap.keys()),
          items: processedItems.map(item => ({
            gasTypeId: item.gasTypeId,
            cylinderSize: item.cylinderSize,
            quantity: item.quantity,
            supplierId: item.supplierId
          })),
          timestamp: new Date().toISOString()
        });

        logger.info('Order created successfully', {
          orderId: order.id,
          customerId: userId,
          totalAmount,
          itemCount: items.length,
          isEmergency
        });

        res.status(201).json({
          message: 'Order created successfully',
          order: {
            id: order.id,
            status: order.status,
            totalAmount: parseFloat(order.total_amount),
            deliveryFee: parseFloat(order.delivery_fee),
            emergencySurcharge: parseFloat(order.emergency_surcharge || 0),
            isEmergency: order.is_emergency,
            deliveryDate: order.delivery_date,
            deliveryTimeSlot: order.delivery_time_slot,
            createdAt: order.created_at,
            items: processedItems
          }
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to create order:', {
        error: error.message,
        userId,
        items: items?.length || 0
      });
      throw error;
    }
  }

  /**
   * Find available suppliers for a specific gas type and cylinder size
   */
  static async findAvailableSuppliers(gasTypeId, cylinderSize, requiredQuantity, deliveryAddress) {
    try {
      // Call supplier service to get available inventory
      const response = await axios.get(`${config.services.supplierService}/api/v1/inventory/available`, {
        params: {
          gasTypeId,
          cylinderSize,
          minQuantity: requiredQuantity,
          latitude: deliveryAddress.latitude,
          longitude: deliveryAddress.longitude,
          maxDistance: 50 // 50km radius
        },
        headers: {
          'X-Service-Request': 'orders-service'
        },
        timeout: 5000
      });

      return response.data.suppliers || [];
    } catch (error) {
      logger.error('Failed to find available suppliers:', {
        error: error.message,
        gasTypeId,
        cylinderSize,
        requiredQuantity
      });
      return [];
    }
  }

  /**
   * Select the best supplier based on distance, price, and rating
   */
  static selectBestSupplier(suppliers, isEmergency) {
    if (suppliers.length === 0) {
      throw new BusinessLogicError('No suppliers available');
    }

    // Sort suppliers by priority
    const sortedSuppliers = suppliers.sort((a, b) => {
      if (isEmergency) {
        // For emergency orders, prioritize distance and availability
        return a.distance - b.distance;
      } else {
        // For regular orders, balance price, distance, and rating
        const scoreA = (a.rating * 0.4) + ((100 - a.distance) * 0.3) + ((100 - a.priceRank) * 0.3);
        const scoreB = (b.rating * 0.4) + ((100 - b.distance) * 0.3) + ((100 - b.priceRank) * 0.3);
        return scoreB - scoreA;
      }
    });

    return sortedSuppliers[0];
  }

  /**
   * Calculate pricing for an item including discounts and bulk pricing
   */
  static async calculateItemPricing(supplierId, gasTypeId, cylinderSize, quantity, customerRole) {
    try {
      // First try to get pricing from supplier service
      const response = await axios.post(`${config.services.supplierService}/api/v1/pricing/calculate`, {
        items: [{
          gasTypeId,
          cylinderSize,
          quantity
        }],
        customerType: customerRole === 'household' ? 'retail' : customerRole
      }, {
        headers: {
          'X-Service-Request': 'orders-service',
          'Authorization': `Bearer ${config.services.internalToken}`
        },
        timeout: 5000
      });

      if (response.data && response.data.calculation && response.data.calculation.items.length > 0) {
        const item = response.data.calculation.items[0];
        return {
          basePrice: item.unitPrice + (item.discountAmount || 0),
          finalPrice: item.unitPrice,
          discount: item.discountAmount || 0,
          pricingRuleId: item.pricingRuleId
        };
      }

      throw new Error('No pricing data returned from supplier service');
    } catch (error) {
      logger.error('Failed to calculate pricing via supplier service:', {
        error: error.message,
        supplierId,
        gasTypeId,
        cylinderSize,
        quantity
      });

      // Fallback to database pricing lookup
      return await this.calculateFallbackPricing(supplierId, gasTypeId, cylinderSize, quantity, customerRole);
    }
  }

  /**
   * Fallback pricing calculation using direct database queries
   */
  static async calculateFallbackPricing(supplierId, gasTypeId, cylinderSize, quantity, customerRole) {
    try {
      const customerType = customerRole === 'household' ? 'retail' : customerRole;

      // Query pricing rules directly from database
      const pricingResult = await query(`
        SELECT pr.*, gt.name as gas_type_name
        FROM supplier.pricing pr
        JOIN supplier.gas_types gt ON pr.gas_type_id = gt.id
        WHERE pr.supplier_id = $1
        AND pr.gas_type_id = $2
        AND pr.cylinder_size = $3
        AND pr.customer_type = $4
        AND pr.is_active = true
        AND (pr.effective_from IS NULL OR pr.effective_from <= CURRENT_DATE)
        AND (pr.effective_until IS NULL OR pr.effective_until >= CURRENT_DATE)
        ORDER BY pr.created_at DESC
        LIMIT 1
      `, [supplierId, gasTypeId, cylinderSize, customerType]);

      if (pricingResult.rows.length > 0) {
        const rule = pricingResult.rows[0];
        const basePrice = parseFloat(rule.unit_price);
        let finalPrice = basePrice;
        let discount = 0;

        // Apply bulk discount if applicable
        if (rule.bulk_discount_threshold && quantity >= rule.bulk_discount_threshold) {
          discount = (basePrice * parseFloat(rule.bulk_discount_percentage || 0)) / 100;
          finalPrice = basePrice - discount;
        }

        return {
          basePrice,
          finalPrice,
          discount,
          pricingRuleId: rule.id
        };
      }

      // Final fallback - use default pricing based on cylinder size
      const defaultPricing = this.getDefaultPricing(cylinderSize);
      logger.warn('Using default pricing - no pricing rules found', {
        supplierId,
        gasTypeId,
        cylinderSize,
        customerType,
        defaultPrice: defaultPricing.finalPrice
      });

      return defaultPricing;
    } catch (error) {
      logger.error('Fallback pricing calculation failed:', {
        error: error.message,
        supplierId,
        gasTypeId,
        cylinderSize
      });

      return this.getDefaultPricing(cylinderSize);
    }
  }

  /**
   * Get default pricing based on cylinder size
   */
  static getDefaultPricing(cylinderSize) {
    const sizeToPrice = {
      '3kg': 1800,
      '6kg': 3500,
      '12.5kg': 7500,
      '25kg': 15000,
      '50kg': 30000
    };

    const basePrice = sizeToPrice[cylinderSize] || 5000; // Default to 5000 NGN if size not found

    return {
      basePrice,
      finalPrice: basePrice,
      discount: 0,
      pricingRuleId: null
    };
  }

  /**
   * Calculate delivery fee based on distance and urgency
   */
  static async calculateDeliveryFee(deliveryAddress, isEmergency) {
    const baseDeliveryFee = 500; // Base fee in NGN
    const emergencyMultiplier = isEmergency ? 2 : 1;
    
    // Calculate distance-based fee (simplified)
    const distanceFee = Math.min(deliveryAddress.distance_km || 5, 20) * 50; // 50 NGN per km, max 20km
    
    return (baseDeliveryFee + distanceFee) * emergencyMultiplier;
  }

  /**
   * Get orders with filtering and pagination
   */
  static async getOrders(req, res) {
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      status,
      isEmergency,
      startDate,
      endDate,
      limit = 20,
      offset = 0
    } = req.query;

    try {
      let whereClause = '';
      const params = [];
      let paramCount = 0;

      // Role-based filtering
      if (userRole === 'supplier') {
        whereClause += ` AND EXISTS (
          SELECT 1 FROM orders.order_items oi
          WHERE oi.order_id = o.id AND oi.supplier_id = $${++paramCount}
        )`;
        params.push(userId);
      } else {
        whereClause += ` AND o.customer_id = $${++paramCount}`;
        params.push(userId);
      }

      // Status filtering
      if (status) {
        whereClause += ` AND o.status = $${++paramCount}`;
        params.push(status);
      }

      // Emergency filtering
      if (isEmergency !== undefined) {
        whereClause += ` AND o.is_emergency = $${++paramCount}`;
        params.push(isEmergency === 'true');
      }

      // Date range filtering
      if (startDate) {
        whereClause += ` AND o.created_at >= $${++paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND o.created_at <= $${++paramCount}`;
        params.push(endDate);
      }

      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM orders.orders o
        WHERE 1=1 ${whereClause}
      `, params);

      const total = parseInt(countResult.rows[0].total);

      // Get orders with pagination
      const ordersResult = await query(`
        SELECT
          o.*,
          a.street_address,
          a.city,
          a.state,
          a.postal_code
        FROM orders.orders o
        LEFT JOIN auth.addresses a ON o.delivery_address_id = a.id
        WHERE 1=1 ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `, [...params, limit, offset]);

      // Get order items for each order
      const orders = [];
      for (const order of ordersResult.rows) {
        const itemsResult = await query(`
          SELECT
            oi.*,
            gt.name as gas_type_name,
            gt.category as gas_type_category
          FROM orders.order_items oi
          JOIN orders.gas_types gt ON oi.gas_type_id = gt.id
          WHERE oi.order_id = $1
        `, [order.id]);

        orders.push({
          id: order.id,
          status: order.status,
          totalAmount: parseFloat(order.total_amount),
          deliveryFee: parseFloat(order.delivery_fee),
          emergencySurcharge: parseFloat(order.emergency_surcharge || 0),
          isEmergency: order.is_emergency,
          deliveryDate: order.delivery_date,
          deliveryTimeSlot: order.delivery_time_slot,
          notes: order.notes,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          deliveryAddress: {
            streetAddress: order.street_address,
            city: order.city,
            state: order.state,
            postalCode: order.postal_code
          },
          items: itemsResult.rows.map(item => ({
            id: item.id,
            gasTypeId: item.gas_type_id,
            gasTypeName: item.gas_type_name,
            gasTypeCategory: item.gas_type_category,
            cylinderSize: item.cylinder_size,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            originalPrice: parseFloat(item.original_price),
            discountAmount: parseFloat(item.discount_amount || 0),
            totalPrice: parseFloat(item.total_price),
            supplierId: item.supplier_id
          }))
        });
      }

      res.json({
        orders,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          limit: parseInt(limit),
          hasNext: offset + limit < total,
          hasPrev: offset > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get orders:', {
        error: error.message,
        userId,
        userRole
      });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  static async getOrderById(req, res) {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
      // Get order with access control
      let orderQuery = `
        SELECT
          o.*,
          a.street_address,
          a.city,
          a.state,
          a.postal_code,
          a.latitude,
          a.longitude
        FROM orders.orders o
        LEFT JOIN auth.addresses a ON o.delivery_address_id = a.id
        WHERE o.id = $1
      `;

      const params = [id];

      // Role-based access control
      if (userRole === 'supplier') {
        orderQuery += ` AND EXISTS (
          SELECT 1 FROM orders.order_items oi
          WHERE oi.order_id = o.id AND oi.supplier_id = $2
        )`;
        params.push(userId);
      } else if (userRole !== 'admin') {
        orderQuery += ` AND o.customer_id = $2`;
        params.push(userId);
      }

      const orderResult = await query(orderQuery, params);

      if (orderResult.rows.length === 0) {
        throw new NotFoundError('Order not found');
      }

      const order = orderResult.rows[0];

      // Get order items
      const itemsResult = await query(`
        SELECT
          oi.*,
          gt.name as gas_type_name,
          gt.category as gas_type_category
        FROM orders.order_items oi
        JOIN orders.gas_types gt ON oi.gas_type_id = gt.id
        WHERE oi.order_id = $1
      `, [id]);

      // Get order status history
      const historyResult = await query(`
        SELECT * FROM orders.order_status_history
        WHERE order_id = $1
        ORDER BY created_at ASC
      `, [id]);

      res.json({
        order: {
          id: order.id,
          customerId: order.customer_id,
          customerRole: order.customer_role,
          status: order.status,
          totalAmount: parseFloat(order.total_amount),
          deliveryFee: parseFloat(order.delivery_fee),
          emergencySurcharge: parseFloat(order.emergency_surcharge || 0),
          isEmergency: order.is_emergency,
          deliveryDate: order.delivery_date,
          deliveryTimeSlot: order.delivery_time_slot,
          notes: order.notes,
          paymentMethodId: order.payment_method_id,
          useWallet: order.use_wallet,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          deliveryAddress: {
            streetAddress: order.street_address,
            city: order.city,
            state: order.state,
            postalCode: order.postal_code,
            latitude: order.latitude,
            longitude: order.longitude
          },
          items: itemsResult.rows.map(item => ({
            id: item.id,
            gasTypeId: item.gas_type_id,
            gasTypeName: item.gas_type_name,
            gasTypeCategory: item.gas_type_category,
            cylinderSize: item.cylinder_size,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price),
            originalPrice: parseFloat(item.original_price),
            discountAmount: parseFloat(item.discount_amount || 0),
            totalPrice: parseFloat(item.total_price),
            supplierId: item.supplier_id
          })),
          statusHistory: historyResult.rows.map(history => ({
            id: history.id,
            status: history.status,
            notes: history.notes,
            changedBy: history.changed_by,
            createdAt: history.created_at
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get order by ID:', {
        error: error.message,
        orderId: id,
        userId,
        userRole
      });
      throw error;
    }
  }

  /**
   * Update order status with business rules validation
   */
  static async updateOrderStatus(req, res) {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
      // Get current order
      const orderResult = await query(
        'SELECT * FROM orders.orders WHERE id = $1',
        [id]
      );

      if (orderResult.rows.length === 0) {
        throw new NotFoundError('Order not found');
      }

      const order = orderResult.rows[0];
      const currentStatus = order.status;

      // Validate status transition
      if (!this.isValidStatusTransition(currentStatus, status, userRole)) {
        throw new ValidationError(`Invalid status transition from ${currentStatus} to ${status} for role ${userRole}`);
      }

      // Start transaction
      await query('BEGIN');

      try {
        // Update order status
        await query(
          'UPDATE orders.orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [status, id]
        );

        // Add status history
        await query(`
          INSERT INTO orders.order_status_history (order_id, old_status, new_status, changed_by, notes)
          VALUES ($1, $2, $3, $4, $5)
        `, [id, currentStatus, status, userId, notes]);

        // Handle status-specific business logic
        await this.handleStatusTransition(order, currentStatus, status, userId);

        await query('COMMIT');

        // Publish status change event
        await publishEvent('orders.events', 'order.status.changed', {
          eventType: 'order.status.changed',
          orderId: id,
          oldStatus: currentStatus,
          newStatus: status,
          changedBy: userId,
          userRole,
          timestamp: new Date().toISOString()
        });

        logger.info('Order status updated', {
          orderId: id,
          oldStatus: currentStatus,
          newStatus: status,
          changedBy: userId,
          userRole
        });

        res.json({
          message: 'Order status updated successfully',
          orderId: id,
          oldStatus: currentStatus,
          newStatus: status,
          updatedAt: new Date().toISOString()
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to update order status:', {
        error: error.message,
        orderId: id,
        status,
        userId,
        userRole
      });
      throw error;
    }
  }

  /**
   * Validate if status transition is allowed for the user role
   */
  static isValidStatusTransition(currentStatus, newStatus, userRole) {
    const transitions = {
      'pending': {
        'confirmed': ['supplier', 'platform_admin'],
        'cancelled': ['household', 'supplier', 'platform_admin']
      },
      'confirmed': {
        'preparing': ['supplier', 'platform_admin'],
        'cancelled': ['supplier', 'platform_admin']
      },
      'preparing': {
        'out_for_delivery': ['supplier', 'delivery_driver', 'platform_admin'],
        'cancelled': ['supplier', 'platform_admin']
      },
      'out_for_delivery': {
        'delivered': ['delivery_driver', 'platform_admin'],
        'failed': ['delivery_driver', 'platform_admin']
      },
      'delivered': {
        // Delivered is final state
      },
      'cancelled': {
        // Cancelled is final state
      },
      'failed': {
        'pending': ['platform_admin'], // Allow retry
        'cancelled': ['platform_admin']
      }
    };

    const allowedRoles = transitions[currentStatus]?.[newStatus];
    return allowedRoles && allowedRoles.includes(userRole);
  }

  /**
   * Handle business logic for specific status transitions
   */
  static async handleStatusTransition(order, oldStatus, newStatus, userId) {
    switch (newStatus) {
      case 'confirmed':
        // Reserve inventory, assign delivery slot
        await this.handleOrderConfirmation(order, userId);
        break;

      case 'preparing':
        // Notify customer, update estimated delivery time
        await this.handleOrderPreparation(order, userId);
        break;

      case 'out_for_delivery':
        // Assign driver, start tracking
        await this.handleDeliveryStart(order, userId);
        break;

      case 'delivered':
        // Complete payment, update inventory, send receipt
        await this.handleOrderDelivery(order, userId);
        break;

      case 'cancelled':
        // Release inventory, process refund
        await this.handleOrderCancellation(order, userId);
        break;

      case 'failed':
        // Log failure reason, release inventory
        await this.handleOrderFailure(order, userId);
        break;
    }
  }

  /**
   * Handle order confirmation logic
   */
  static async handleOrderConfirmation(order, userId) {
    // Create delivery record
    await query(`
      INSERT INTO orders.deliveries (order_id, status, scheduled_date)
      VALUES ($1, 'assigned', CURRENT_DATE + INTERVAL '1 day')
    `, [order.id]);

    logger.info('Order confirmed - delivery scheduled', {
      orderId: order.id,
      confirmedBy: userId
    });
  }

  /**
   * Handle order preparation logic
   */
  static async handleOrderPreparation(order, userId) {
    // Update estimated delivery time
    await query(`
      UPDATE orders.deliveries
      SET estimated_arrival = CURRENT_TIMESTAMP + INTERVAL '2 hours'
      WHERE order_id = $1
    `, [order.id]);

    logger.info('Order preparation started', {
      orderId: order.id,
      preparedBy: userId
    });
  }

  /**
   * Handle delivery start logic
   */
  static async handleDeliveryStart(order, userId) {
    // Update delivery status
    await query(`
      UPDATE orders.deliveries
      SET status = 'in_transit', driver_id = $2, actual_departure = CURRENT_TIMESTAMP
      WHERE order_id = $1
    `, [order.id, userId]);

    logger.info('Delivery started', {
      orderId: order.id,
      driverId: userId
    });
  }

  /**
   * Handle order delivery completion
   */
  static async handleOrderDelivery(order, userId) {
    // Update delivery status
    await query(`
      UPDATE orders.deliveries
      SET status = 'delivered', actual_arrival = CURRENT_TIMESTAMP
      WHERE order_id = $1
    `, [order.id]);

    // Mark order as delivered
    await query(`
      UPDATE orders.orders
      SET delivered_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [order.id]);

    logger.info('Order delivered successfully', {
      orderId: order.id,
      deliveredBy: userId
    });
  }

  /**
   * Handle order cancellation logic
   */
  static async handleOrderCancellation(order, userId) {
    // Release reserved inventory
    const itemsResult = await query(
      'SELECT * FROM orders.order_items WHERE order_id = $1',
      [order.id]
    );

    for (const item of itemsResult.rows) {
      await query(`
        UPDATE supplier.inventory
        SET quantity_available = quantity_available + $1
        WHERE gas_type_id = $2 AND cylinder_size = $3 AND supplier_id = $4
      `, [item.quantity, item.gas_type_id, item.cylinder_size, item.supplier_id]);
    }

    // Mark order as cancelled
    await query(`
      UPDATE orders.orders
      SET cancelled_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [order.id]);

    logger.info('Order cancelled - inventory released', {
      orderId: order.id,
      cancelledBy: userId
    });
  }

  /**
   * Handle order failure logic
   */
  static async handleOrderFailure(order, userId) {
    // Similar to cancellation but with different logging
    await this.handleOrderCancellation(order, userId);

    logger.warn('Order failed', {
      orderId: order.id,
      failedBy: userId
    });
  }
}

module.exports = OrderController;
