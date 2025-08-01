const { query, transaction } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const { broadcastDeliveryUpdate } = require('../services/websocket');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');

class TrackingController {
  /**
   * Get real-time tracking information for an order
   */
  static async getOrderTracking(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Get order and delivery information
      const trackingQuery = `
        SELECT 
          o.id as order_id,
          o.customer_id,
          o.status as order_status,
          o.is_emergency,
          o.total_amount,
          o.delivery_date,
          o.delivery_time_slot,
          d.id as delivery_id,
          d.driver_id,
          d.status as delivery_status,
          d.scheduled_date,
          d.estimated_arrival,
          d.actual_arrival,
          d.current_latitude,
          d.current_longitude,
          d.notes as delivery_notes,
          a.street_address,
          a.city,
          a.state,
          a.postal_code,
          a.latitude as delivery_latitude,
          a.longitude as delivery_longitude,
          u.email as driver_email,
          u.phone as driver_phone,
          p.first_name as driver_first_name,
          p.last_name as driver_last_name
        FROM orders.orders o
        LEFT JOIN orders.deliveries d ON o.id = d.order_id
        LEFT JOIN auth.addresses a ON o.delivery_address_id = a.id
        LEFT JOIN auth.users u ON d.driver_id = u.id
        LEFT JOIN auth.profiles p ON d.driver_id = p.user_id
        WHERE o.id = $1
      `;

      const trackingResult = await query(trackingQuery, [orderId]);

      if (trackingResult.rows.length === 0) {
        throw new NotFoundError('Order not found');
      }

      const tracking = trackingResult.rows[0];

      // Check access permissions
      if (userRole === 'household' && tracking.customer_id !== userId) {
        throw new NotFoundError('Order not found');
      }

      if (userRole === 'delivery_driver' && tracking.driver_id !== userId) {
        throw new NotFoundError('Order not found');
      }

      // Get tracking history - handle if table doesn't exist yet
      let historyResult = { rows: [] };
      try {
        historyResult = await query(`
          SELECT
            status,
            latitude,
            longitude,
            notes,
            created_at,
            updated_by
          FROM orders.delivery_tracking
          WHERE delivery_id = $1
          ORDER BY created_at DESC
          LIMIT 20
        `, [tracking.delivery_id]);
      } catch (error) {
        // Table might not exist yet, continue without history
        logger.warn('Delivery tracking table not found, skipping history', {
          deliveryId: tracking.delivery_id,
          error: error.message
        });
      }

      // Calculate estimated delivery time
      let estimatedDelivery = null;
      if (tracking.delivery_status === 'in_transit' && tracking.current_latitude && tracking.current_longitude) {
        estimatedDelivery = await this.calculateEstimatedDelivery(
          tracking.current_latitude,
          tracking.current_longitude,
          tracking.delivery_latitude,
          tracking.delivery_longitude
        );
      }

      const response = {
        order: {
          id: tracking.order_id,
          status: tracking.order_status,
          isEmergency: tracking.is_emergency,
          totalAmount: parseFloat(tracking.total_amount || 0),
          deliveryDate: tracking.delivery_date,
          deliveryTimeSlot: tracking.delivery_time_slot
        },
        delivery: tracking.delivery_id ? {
          id: tracking.delivery_id,
          status: tracking.delivery_status,
          scheduledDate: tracking.scheduled_date,
          estimatedArrival: tracking.estimated_arrival,
          actualArrival: tracking.actual_arrival,
          estimatedDelivery,
          notes: tracking.delivery_notes,
          driver: tracking.driver_id ? {
            id: tracking.driver_id,
            name: `${tracking.driver_first_name || ''} ${tracking.driver_last_name || ''}`.trim(),
            email: tracking.driver_email,
            phone: tracking.driver_phone
          } : null,
          currentLocation: tracking.current_latitude && tracking.current_longitude ? {
            latitude: parseFloat(tracking.current_latitude),
            longitude: parseFloat(tracking.current_longitude),
            lastUpdated: tracking.updated_at
          } : null
        } : null,
        deliveryAddress: {
          streetAddress: tracking.street_address,
          city: tracking.city,
          state: tracking.state,
          postalCode: tracking.postal_code,
          coordinates: tracking.delivery_latitude && tracking.delivery_longitude ? {
            latitude: parseFloat(tracking.delivery_latitude),
            longitude: parseFloat(tracking.delivery_longitude)
          } : null
        },
        trackingHistory: historyResult.rows.map(row => ({
          status: row.status,
          location: row.latitude && row.longitude ? {
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude)
          } : null,
          notes: row.notes,
          timestamp: row.created_at,
          updatedBy: row.updated_by
        })),
        lastUpdated: new Date().toISOString()
      };

      logger.info('Order tracking retrieved', {
        orderId,
        userId,
        userRole,
        hasDelivery: !!tracking.delivery_id
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to get order tracking:', {
        error: error.message,
        orderId: req.params.orderId,
        userId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Update delivery location (driver only)
   */
  static async updateDeliveryLocation(req, res) {
    try {
      const { orderId } = req.params;
      const { latitude, longitude, status, notes } = req.body;
      const driverId = req.user.id;

      // Validate coordinates
      if (!latitude || !longitude) {
        throw new ValidationError('Latitude and longitude are required');
      }

      if (latitude < -90 || latitude > 90) {
        throw new ValidationError('Invalid latitude value');
      }

      if (longitude < -180 || longitude > 180) {
        throw new ValidationError('Invalid longitude value');
      }

      // Get delivery information
      const deliveryResult = await query(`
        SELECT d.*, o.customer_id, o.is_emergency
        FROM orders.deliveries d
        JOIN orders.orders o ON d.order_id = o.id
        WHERE d.order_id = $1 AND d.driver_id = $2
      `, [orderId, driverId]);

      if (deliveryResult.rows.length === 0) {
        throw new NotFoundError('Delivery not found or not assigned to you');
      }

      const delivery = deliveryResult.rows[0];

      // Update delivery location and status
      await transaction(async (trx) => {
        // Update current location in deliveries table
        await trx(`
          UPDATE orders.deliveries
          SET 
            current_latitude = $1,
            current_longitude = $2,
            status = COALESCE($3, status),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `, [latitude, longitude, status, delivery.id]);

        // Insert tracking record - handle if table doesn't exist yet
        try {
          await trx(`
            INSERT INTO orders.delivery_tracking (
              delivery_id, status, latitude, longitude, notes, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [delivery.id, status || delivery.status, latitude, longitude, notes, driverId]);
        } catch (error) {
          // Table might not exist yet, log warning but continue
          logger.warn('Failed to insert tracking record, table might not exist', {
            deliveryId: delivery.id,
            error: error.message
          });
        }

        // Update order status if delivered
        if (status === 'delivered') {
          await trx(`
            UPDATE orders.orders
            SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [orderId]);

          // Update actual arrival time
          await trx(`
            UPDATE orders.deliveries
            SET actual_arrival = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [delivery.id]);
        }
      });

      // Broadcast real-time update
      const updateData = {
        orderId,
        deliveryId: delivery.id,
        status: status || delivery.status,
        location: { latitude, longitude },
        notes,
        timestamp: new Date().toISOString(),
        driverId
      };

      broadcastDeliveryUpdate(orderId, updateData);

      // Publish event
      await publishEvent('orders.events', 'delivery.location_updated', {
        eventType: 'delivery.location_updated',
        orderId,
        deliveryId: delivery.id,
        customerId: delivery.customer_id,
        driverId,
        location: { latitude, longitude },
        status: status || delivery.status,
        isEmergency: delivery.is_emergency,
        timestamp: new Date().toISOString()
      });

      logger.info('Delivery location updated', {
        orderId,
        deliveryId: delivery.id,
        driverId,
        latitude,
        longitude,
        status: status || delivery.status
      });

      res.json({
        message: 'Location updated successfully',
        location: { latitude, longitude },
        status: status || delivery.status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to update delivery location:', {
        error: error.message,
        orderId: req.params.orderId,
        driverId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Calculate estimated delivery time based on current location and destination
   */
  static async calculateEstimatedDelivery(currentLat, currentLng, destLat, destLng) {
    try {
      // Calculate distance using Haversine formula
      const distance = this.calculateDistance(currentLat, currentLng, destLat, destLng);
      
      // Estimate time based on average speed (30 km/h in urban areas)
      const averageSpeed = 30; // km/h
      const estimatedHours = distance / averageSpeed;
      const estimatedMinutes = Math.ceil(estimatedHours * 60);
      
      // Add current time to get estimated arrival
      const estimatedArrival = new Date();
      estimatedArrival.setMinutes(estimatedArrival.getMinutes() + estimatedMinutes);
      
      return {
        distanceKm: Math.round(distance * 100) / 100,
        estimatedMinutes,
        estimatedArrival: estimatedArrival.toISOString()
      };
    } catch (error) {
      logger.error('Failed to calculate estimated delivery:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
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
}

module.exports = TrackingController;
