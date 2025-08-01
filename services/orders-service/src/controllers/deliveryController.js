const { query } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');

class DeliveryController {
  /**
   * Get deliveries with filtering
   */
  static async getDeliveries(req, res) {
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      status,
      driverId,
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
      if (userRole === 'delivery_driver') {
        whereClause += ` AND d.driver_id = $${++paramCount}`;
        params.push(userId);
      } else if (userRole === 'supplier') {
        whereClause += ` AND EXISTS (
          SELECT 1 FROM orders.order_items oi 
          WHERE oi.order_id = d.order_id AND oi.supplier_id = $${++paramCount}
        )`;
        params.push(userId);
      }

      // Status filtering
      if (status) {
        whereClause += ` AND d.status = $${++paramCount}`;
        params.push(status);
      }

      // Driver filtering
      if (driverId && userRole !== 'delivery_driver') {
        whereClause += ` AND d.driver_id = $${++paramCount}`;
        params.push(driverId);
      }

      // Date range filtering
      if (startDate) {
        whereClause += ` AND d.created_at >= $${++paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND d.created_at <= $${++paramCount}`;
        params.push(endDate);
      }

      const deliveriesResult = await query(`
        SELECT 
          d.*,
          o.total_amount,
          o.is_emergency,
          a.street_address,
          a.city,
          a.state,
          a.latitude,
          a.longitude
        FROM orders.deliveries d
        JOIN orders.orders o ON d.order_id = o.id
        LEFT JOIN auth.addresses a ON o.delivery_address_id = a.id
        WHERE 1=1 ${whereClause}
        ORDER BY d.created_at DESC
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `, [...params, limit, offset]);

      const deliveries = deliveriesResult.rows.map(delivery => ({
        id: delivery.id,
        orderId: delivery.order_id,
        driverId: delivery.driver_id,
        status: delivery.status,
        scheduledDate: delivery.scheduled_date,
        estimatedArrival: delivery.estimated_arrival,
        actualArrival: delivery.actual_arrival,
        notes: delivery.notes,
        totalAmount: parseFloat(delivery.total_amount),
        isEmergency: delivery.is_emergency,
        deliveryAddress: {
          streetAddress: delivery.street_address,
          city: delivery.city,
          state: delivery.state,
          latitude: delivery.latitude,
          longitude: delivery.longitude
        },
        createdAt: delivery.created_at,
        updatedAt: delivery.updated_at
      }));

      res.json({
        deliveries,
        pagination: {
          total: deliveries.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Failed to get deliveries:', {
        error: error.message,
        userId,
        userRole
      });
      throw error;
    }
  }

  /**
   * Assign delivery to driver
   */
  static async assignDelivery(req, res) {
    const { orderId } = req.params;
    const { driverId, scheduledDate, notes } = req.body;
    const userId = req.user.id;

    try {
      // Check if order exists and is ready for delivery
      const orderResult = await query(
        'SELECT * FROM orders.orders WHERE id = $1 AND status IN ($2, $3)',
        [orderId, 'confirmed', 'preparing']
      );

      if (orderResult.rows.length === 0) {
        throw new NotFoundError('Order not found or not ready for delivery assignment');
      }

      const order = orderResult.rows[0];

      // Check if delivery already exists
      const existingDelivery = await query(
        'SELECT * FROM orders.deliveries WHERE order_id = $1',
        [orderId]
      );

      if (existingDelivery.rows.length > 0) {
        throw new BusinessLogicError('Delivery already assigned for this order');
      }

      // Create delivery record
      const deliveryResult = await query(`
        INSERT INTO orders.deliveries (
          order_id, driver_id, status, scheduled_date, notes, assigned_by
        ) VALUES ($1, $2, 'assigned', $3, $4, $5)
        RETURNING *
      `, [orderId, driverId, scheduledDate, notes, userId]);

      const delivery = deliveryResult.rows[0];

      // Update order status
      await query(
        'UPDATE orders.orders SET status = $1 WHERE id = $2',
        ['out_for_delivery', orderId]
      );

      // Publish delivery assigned event
      await publishEvent('orders.events', 'delivery.assigned', {
        eventType: 'delivery.assigned',
        deliveryId: delivery.id,
        orderId,
        driverId,
        scheduledDate,
        assignedBy: userId,
        timestamp: new Date().toISOString()
      });

      logger.info('Delivery assigned successfully', {
        deliveryId: delivery.id,
        orderId,
        driverId,
        assignedBy: userId
      });

      res.status(201).json({
        message: 'Delivery assigned successfully',
        delivery: {
          id: delivery.id,
          orderId: delivery.order_id,
          driverId: delivery.driver_id,
          status: delivery.status,
          scheduledDate: delivery.scheduled_date,
          notes: delivery.notes,
          createdAt: delivery.created_at
        }
      });
    } catch (error) {
      logger.error('Failed to assign delivery:', {
        error: error.message,
        orderId,
        driverId,
        userId
      });
      throw error;
    }
  }

  /**
   * Update delivery status
   */
  static async updateDeliveryStatus(req, res) {
    const { id } = req.params;
    const { status, notes, latitude, longitude } = req.body;
    const userId = req.user.id;

    try {
      // Get current delivery
      const deliveryResult = await query(
        'SELECT * FROM orders.deliveries WHERE id = $1',
        [id]
      );

      if (deliveryResult.rows.length === 0) {
        throw new NotFoundError('Delivery not found');
      }

      const delivery = deliveryResult.rows[0];

      // Check permissions (only assigned driver can update)
      if (delivery.driver_id !== userId && req.user.role !== 'admin') {
        throw new ValidationError('Unauthorized to update this delivery');
      }

      // Update delivery status
      const updateFields = ['status = $2', 'notes = $3', 'updated_at = CURRENT_TIMESTAMP'];
      const updateParams = [id, status, notes];
      let paramCount = 3;

      // Update location if provided
      if (latitude && longitude) {
        updateFields.push(`current_latitude = $${++paramCount}`);
        updateFields.push(`current_longitude = $${++paramCount}`);
        updateParams.push(latitude, longitude);
      }

      // Set actual arrival time if delivered
      if (status === 'delivered') {
        updateFields.push(`actual_arrival = CURRENT_TIMESTAMP`);
      }

      await query(`
        UPDATE orders.deliveries 
        SET ${updateFields.join(', ')}
        WHERE id = $1
      `, updateParams);

      // Update order status if delivered
      if (status === 'delivered') {
        await query(
          'UPDATE orders.orders SET status = $1 WHERE id = $2',
          ['delivered', delivery.order_id]
        );
      }

      // Publish delivery status update event
      await publishEvent('orders.events', 'delivery.status_updated', {
        eventType: 'delivery.status_updated',
        deliveryId: id,
        orderId: delivery.order_id,
        oldStatus: delivery.status,
        newStatus: status,
        driverId: userId,
        location: latitude && longitude ? { latitude, longitude } : null,
        timestamp: new Date().toISOString()
      });

      logger.info('Delivery status updated', {
        deliveryId: id,
        orderId: delivery.order_id,
        oldStatus: delivery.status,
        newStatus: status,
        driverId: userId
      });

      res.json({
        message: 'Delivery status updated successfully',
        delivery: {
          id,
          status,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to update delivery status:', {
        error: error.message,
        deliveryId: id,
        status,
        userId
      });
      throw error;
    }
  }

  /**
   * Get delivery tracking information
   */
  static async getDeliveryTracking(req, res) {
    const { id } = req.params;

    try {
      const trackingResult = await query(`
        SELECT 
          d.*,
          o.customer_id,
          o.total_amount,
          o.is_emergency,
          a.street_address,
          a.city,
          a.state,
          a.latitude as delivery_latitude,
          a.longitude as delivery_longitude
        FROM orders.deliveries d
        JOIN orders.orders o ON d.order_id = o.id
        LEFT JOIN auth.addresses a ON o.delivery_address_id = a.id
        WHERE d.id = $1
      `, [id]);

      if (trackingResult.rows.length === 0) {
        throw new NotFoundError('Delivery not found');
      }

      const tracking = trackingResult.rows[0];

      res.json({
        tracking: {
          id: tracking.id,
          orderId: tracking.order_id,
          status: tracking.status,
          scheduledDate: tracking.scheduled_date,
          estimatedArrival: tracking.estimated_arrival,
          actualArrival: tracking.actual_arrival,
          currentLocation: tracking.current_latitude && tracking.current_longitude ? {
            latitude: tracking.current_latitude,
            longitude: tracking.current_longitude
          } : null,
          deliveryAddress: {
            streetAddress: tracking.street_address,
            city: tracking.city,
            state: tracking.state,
            latitude: tracking.delivery_latitude,
            longitude: tracking.delivery_longitude
          },
          isEmergency: tracking.is_emergency,
          totalAmount: parseFloat(tracking.total_amount),
          createdAt: tracking.created_at,
          updatedAt: tracking.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to get delivery tracking:', {
        error: error.message,
        deliveryId: id
      });
      throw error;
    }
  }
}

module.exports = DeliveryController;
