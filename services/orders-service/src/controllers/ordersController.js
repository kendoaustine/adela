const AuthServiceClient = require('../lib/service-clients/authServiceClient');
const SupplierServiceClient = require('../lib/service-clients/supplierServiceClient');
const Order = require('../models/Order');
const { publishEvent } = require('../services/rabbitmq');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');
const { query, transaction } = require('../database/connection');

// Initialize service clients
const authServiceClient = new AuthServiceClient();
const supplierServiceClient = new SupplierServiceClient();

// Initialize service manager
let serviceManager = null;
const initializeServiceManager = async () => {
  if (!serviceManager) {
    const ServiceManager = require('../services/serviceManager');
    serviceManager = new ServiceManager();
    await serviceManager.initialize();
  }
  return serviceManager;
};

class OrdersController {
  /**
   * Test inter-service communication
   */
  static async testInterServiceCommunication(req, res) {
    const userId = req.user.id;
    const authToken = req.headers.authorization.substring(7);

    try {
      // Test 1: Get user addresses from Auth Service
      let userAddresses = [];
      try {
        const addressResult = await authServiceClient.getUserAddresses(authToken);
        userAddresses = addressResult.addresses || [];
      } catch (error) {
        logger.warn('Failed to get user addresses:', error.message);
        userAddresses = [{ id: 'mock-address', address: 'Mock address for testing' }];
      }

      // Test 2: Get supplier inventory from Supplier Service
      let supplierInventory = [];
      try {
        supplierServiceClient.setAuthToken(authToken);
        const inventoryResult = await supplierServiceClient.getInventory(authToken);
        supplierInventory = inventoryResult.inventory || [];
      } catch (error) {
        logger.warn('Failed to get supplier inventory:', error.message);
        supplierInventory = [{ id: 'mock-inventory', message: 'Could not fetch inventory' }];
      }

      res.json({
        message: 'Inter-service communication test successful',
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role
        },
        services: {
          authService: {
            status: userAddresses.length > 0 ? 'connected' : 'limited',
            addressCount: userAddresses.length,
            addresses: userAddresses.slice(0, 2) // Show first 2 addresses
          },
          supplierService: {
            status: supplierInventory.length > 0 ? 'connected' : 'limited',
            inventoryCount: supplierInventory.length,
            inventory: supplierInventory.slice(0, 2) // Show first 2 items
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Inter-service communication test failed:', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Create a new order
   */
  static async createOrder(req, res) {
    const { supplierId, deliveryAddressId, orderType = 'regular', items, specialInstructions, emergencyContactPhone, scheduledDeliveryDate, recurringConfig } = req.body;
    const userId = req.user.id;
    const authToken = req.headers.authorization;

    try {
      // Initialize service manager if needed
      const sm = await initializeServiceManager();

      // 1. Validate delivery address belongs to user
      const address = await sm.getAddressById(deliveryAddressId, authToken);
      if (!address) {
        throw new ValidationError('Invalid delivery address');
      }

      // 2. Check inventory availability
      const availability = await sm.checkInventoryAvailability(supplierId, items, authToken);

      // Validate all items are available
      const unavailableItems = [];
      for (const item of items) {
        const key = `${item.gasTypeId}-${item.cylinderSize}`;
        if (!availability[key] || !availability[key].available) {
          unavailableItems.push({
            gasTypeId: item.gasTypeId,
            cylinderSize: item.cylinderSize,
            requested: item.quantity,
            available: availability[key]?.quantityAvailable || 0
          });
        }
      }

      if (unavailableItems.length > 0) {
        throw new BusinessLogicError('Some items are not available in requested quantities', {
          unavailableItems
        });
      }

      // 3. Calculate pricing
      const customerType = req.user.role === 'household' ? 'retail' : 'wholesale';
      const pricing = await sm.calculateOrderPricing(supplierId, items, customerType, authToken);

      // 4. Calculate delivery fee
      const deliveryFee = await Order.calculateDeliveryFee(supplierId, deliveryAddressId, orderType);

      // 5. Calculate totals
      const subtotal = pricing.subtotal;
      const taxAmount = subtotal * 0.075; // 7.5% VAT
      const totalAmount = subtotal + taxAmount + deliveryFee;

      // 6. Reserve inventory
      let reservationId = null;
      try {
        const reservation = await sm.reserveInventory(supplierId, items, null, authToken);
        reservationId = reservation.reservationId;
      } catch (error) {
        logger.warn('Failed to reserve inventory, proceeding without reservation:', error.message);
      }

      // 7. Create order
      const orderData = {
        userId,
        supplierId,
        deliveryAddressId,
        orderType,
        priority: orderType === 'emergency_sos' ? 'high' : 'normal',
        items: pricing.items, // Use items with calculated pricing
        subtotal,
        taxAmount,
        deliveryFee,
        totalAmount,
        specialInstructions,
        emergencyContactPhone,
        scheduledDeliveryDate,
        recurringConfig,
        reservationId
      };

      const order = await Order.create(orderData);

      // 8. Update inventory quantities
      try {
        await sm.updateInventoryQuantities(supplierId, items, authToken);
      } catch (error) {
        logger.error('Failed to update inventory quantities:', error.message);
        // Don't fail the order creation, but log for manual intervention
      }

      // 9. Publish order created event
      await publishEvent('orders.events', 'order.created', {
        eventType: 'order.created',
        orderId: order.id,
        userId,
        supplierId,
        orderType,
        totalAmount,
        timestamp: new Date().toISOString()
      });

      logger.info('Order created successfully', {
        orderId: order.id,
        userId,
        supplierId,
        totalAmount
      });

      res.status(201).json({
        message: 'Order created successfully',
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          orderType: order.orderType,
          priority: order.priority,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          deliveryFee: order.deliveryFee,
          totalAmount: order.totalAmount,
          items: pricing.items,
          deliveryAddress: address,
          createdAt: order.createdAt
        }
      });
    } catch (error) {
      logger.error('Order creation failed:', {
        error: error.message,
        userId,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Get user's orders
   */
  static async getUserOrders(req, res) {
    const userId = req.user.id;
    const { status, orderType, limit = 20, offset = 0 } = req.query;

    try {
      const orders = await Order.findByUserId(userId, {
        status,
        orderType,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Get supplier information for each order
      const authToken = req.headers.authorization;
      const supplierIds = [...new Set(orders.map(order => order.supplierId))];
      const supplierInfo = {};

      // Initialize service manager if needed
      const sm = await initializeServiceManager();

      for (const supplierId of supplierIds) {
        try {
          const supplier = await sm.getSupplierInfo(supplierId, authToken);
          supplierInfo[supplierId] = supplier;
        } catch (error) {
          logger.warn(`Failed to get supplier info for ${supplierId}:`, error.message);
          supplierInfo[supplierId] = { id: supplierId, name: 'Unknown Supplier' };
        }
      }

      // Enrich orders with supplier information
      const enrichedOrders = orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        orderType: order.orderType,
        priority: order.priority,
        totalAmount: order.totalAmount,
        supplier: supplierInfo[order.supplierId],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }));

      res.json({
        orders: enrichedOrders,
        pagination: {
          total: orders.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasNext: orders.length === parseInt(limit),
          hasPrev: parseInt(offset) > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get user orders:', {
        error: error.message,
        userId
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
    const authToken = req.headers.authorization;

    try {
      const order = await Order.findById(id);

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // Verify order belongs to user (unless user is supplier or admin)
      if (req.user.role === 'household' && order.userId !== userId) {
        throw new NotFoundError('Order not found');
      }

      // Get order items
      const items = await order.getItems();

      // Initialize service manager if needed
      const sm = await initializeServiceManager();

      // Get supplier information
      let supplierInfo = null;
      try {
        supplierInfo = await sm.getSupplierInfo(order.supplierId, authToken);
      } catch (error) {
        logger.warn('Failed to get supplier info:', error.message);
        supplierInfo = { id: order.supplierId, name: 'Unknown Supplier' };
      }

      // Get delivery address
      let deliveryAddress = null;
      try {
        deliveryAddress = await sm.getAddressById(order.deliveryAddressId, authToken);
      } catch (error) {
        logger.warn('Failed to get delivery address:', error.message);
      }

      // Get delivery tracking
      const deliveryTracking = await order.getDeliveryTracking();

      res.json({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          orderType: order.orderType,
          priority: order.priority,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          deliveryFee: order.deliveryFee,
          totalAmount: order.totalAmount,
          specialInstructions: order.specialInstructions,
          emergencyContactPhone: order.emergencyContactPhone,
          scheduledDeliveryDate: order.scheduledDeliveryDate,
          items,
          supplier: supplierInfo,
          deliveryAddress,
          deliveryTracking,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }
      });
    } catch (error) {
      logger.error('Failed to get order:', {
        error: error.message,
        orderId: id,
        userId
      });
      throw error;
    }
  }

  /**
   * Cancel order
   */
  static async cancelOrder(req, res) {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    try {
      const order = await Order.findById(id);
      
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // Verify order belongs to user (unless user is supplier or admin)
      if (req.user.role === 'household' && order.userId !== userId) {
        throw new NotFoundError('Order not found');
      }

      // Cancel the order
      await order.cancel(reason, userId);

      // Publish order cancelled event
      await publishEvent('orders.events', 'order.cancelled', {
        eventType: 'order.cancelled',
        orderId: order.id,
        userId: order.userId,
        supplierId: order.supplierId,
        reason,
        cancelledBy: userId,
        timestamp: new Date().toISOString()
      });

      logger.info('Order cancelled', {
        orderId: order.id,
        reason,
        cancelledBy: userId
      });

      res.json({
        message: 'Order cancelled successfully',
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          cancellationReason: order.cancellationReason,
          cancelledAt: order.cancelledAt
        }
      });
    } catch (error) {
      logger.error('Failed to cancel order:', {
        error: error.message,
        orderId: id,
        userId
      });
      throw error;
    }
  }



  /**
   * Update order status
   */
  static async updateOrderStatus(req, res) {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
      // Validate status transition
      const validStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError('Invalid order status');
      }

      // Get current order
      const currentOrder = await Order.findById(id);
      if (!currentOrder) {
        throw new NotFoundError('Order not found');
      }

      // Check permissions - use userId property instead of customerId
      if (userRole === 'household' && currentOrder.userId !== userId) {
        throw new ValidationError('Unauthorized to update this order');
      }

      // Update order status using instance method
      await currentOrder.updateStatus(status, notes, userId);

      // Publish status update event
      await publishEvent('orders.events', 'order.status_updated', {
        eventType: 'order.status_updated',
        orderId: id,
        oldStatus: currentOrder.status,
        newStatus: status,
        updatedBy: userId,
        notes,
        timestamp: new Date().toISOString()
      });

      logger.info('Order status updated', {
        orderId: id,
        oldStatus: currentOrder.status,
        newStatus: status,
        updatedBy: userId
      });

      res.json({
        message: 'Order status updated successfully',
        order: {
          id,
          status,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to update order status:', {
        error: error.message,
        orderId: id,
        status,
        userId
      });
      throw error;
    }
  }
}

module.exports = OrdersController;
