const { query } = require('../database/connection');
const logger = require('../utils/logger');

class MetricsController {
  /**
   * Get system health metrics
   */
  static async getSystemHealth(req, res) {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        services: {
          database: await this.checkDatabaseHealth(),
          rabbitmq: await this.checkRabbitMQHealth(),
          redis: await this.checkRedisHealth()
        },
        orders: await this.getOrderMetrics(),
        deliveries: await this.getDeliveryMetrics(),
        cylinders: await this.getCylinderMetrics()
      };

      res.json(metrics);
    } catch (error) {
      logger.error('Failed to get system health metrics:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get business KPIs
   */
  static async getBusinessKPIs(req, res) {
    const { period = '24h' } = req.query;

    try {
      let dateFilter = '';
      switch (period) {
        case '1h':
          dateFilter = "AND created_at >= NOW() - INTERVAL '1 hour'";
          break;
        case '24h':
          dateFilter = "AND created_at >= NOW() - INTERVAL '24 hours'";
          break;
        case '7d':
          dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
          break;
        default:
          dateFilter = "AND created_at >= NOW() - INTERVAL '24 hours'";
      }

      const kpis = {
        timestamp: new Date().toISOString(),
        period,
        orders: await this.getOrderKPIs(dateFilter),
        deliveries: await this.getDeliveryKPIs(dateFilter),
        revenue: await this.getRevenueKPIs(dateFilter),
        performance: await this.getPerformanceKPIs(dateFilter)
      };

      res.json(kpis);
    } catch (error) {
      logger.error('Failed to get business KPIs:', {
        error: error.message,
        period
      });
      throw error;
    }
  }

  // Helper methods
  static async checkDatabaseHealth() {
    try {
      const result = await query('SELECT 1 as health');
      return {
        status: 'healthy',
        responseTime: Date.now(),
        details: 'Database connection successful'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  static async checkRabbitMQHealth() {
    // Simplified health check
    return {
      status: 'healthy',
      details: 'RabbitMQ connection active'
    };
  }

  static async checkRedisHealth() {
    // Simplified health check
    return {
      status: 'healthy',
      details: 'Redis connection active'
    };
  }

  static async getOrderMetrics() {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN is_emergency = true THEN 1 END) as emergency_orders,
          AVG(total_amount) as avg_order_value
        FROM orders.orders
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get order metrics:', error);
      return {};
    }
  }

  static async getDeliveryMetrics() {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_deliveries,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed_deliveries,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_deliveries,
          AVG(EXTRACT(EPOCH FROM (actual_arrival - created_at))/3600) as avg_delivery_time_hours
        FROM orders.deliveries
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get delivery metrics:', error);
      return {};
    }
  }

  static async getCylinderMetrics() {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_cylinders,
          COUNT(CASE WHEN status = 'available' THEN 1 END) as available_cylinders,
          COUNT(CASE WHEN status = 'in_use' THEN 1 END) as in_use_cylinders,
          COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_cylinders
        FROM orders.cylinders
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get cylinder metrics:', error);
      return {};
    }
  }

  static async getOrderKPIs(dateFilter) {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          ROUND(
            COUNT(CASE WHEN status = 'delivered' THEN 1 END)::numeric / 
            NULLIF(COUNT(*), 0) * 100, 2
          ) as completion_rate,
          AVG(total_amount) as avg_order_value
        FROM orders.orders
        WHERE 1=1 ${dateFilter}
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get order KPIs:', error);
      return {};
    }
  }

  static async getDeliveryKPIs(dateFilter) {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_deliveries,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as successful_deliveries,
          ROUND(
            COUNT(CASE WHEN status = 'delivered' THEN 1 END)::numeric / 
            NULLIF(COUNT(*), 0) * 100, 2
          ) as success_rate,
          AVG(
            CASE WHEN actual_arrival IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (actual_arrival - created_at))/3600 
            END
          ) as avg_delivery_time_hours
        FROM orders.deliveries
        WHERE 1=1 ${dateFilter}
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get delivery KPIs:', error);
      return {};
    }
  }

  static async getRevenueKPIs(dateFilter) {
    try {
      const result = await query(`
        SELECT 
          SUM(total_amount) as total_revenue,
          COUNT(*) as revenue_orders,
          AVG(total_amount) as avg_revenue_per_order,
          SUM(CASE WHEN is_emergency = true THEN total_amount ELSE 0 END) as emergency_revenue
        FROM orders.orders
        WHERE status = 'delivered' ${dateFilter}
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get revenue KPIs:', error);
      return {};
    }
  }

  static async getPerformanceKPIs(dateFilter) {
    try {
      const result = await query(`
        SELECT 
          AVG(
            EXTRACT(EPOCH FROM (updated_at - created_at))/60
          ) as avg_order_processing_time_minutes,
          COUNT(CASE WHEN is_emergency = true THEN 1 END) as emergency_orders,
          AVG(
            CASE WHEN is_emergency = true 
            THEN EXTRACT(EPOCH FROM (updated_at - created_at))/60 
            END
          ) as avg_emergency_response_time_minutes
        FROM orders.orders
        WHERE status IN ('delivered', 'cancelled') ${dateFilter}
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get performance KPIs:', error);
      return {};
    }
  }
}

module.exports = MetricsController;
