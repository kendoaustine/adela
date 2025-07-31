const CacheManager = require('./CacheManager');
const logger = require('../utils/logger');

/**
 * Orders Service Cache Layer
 * Handles caching for orders, delivery tracking, and real-time data
 */
class OrdersCacheService extends CacheManager {
  constructor(config = {}) {
    super({
      keyPrefix: 'gasconnect:orders:',
      defaultTTL: 3600, // 1 hour
      ...config
    });

    // Cache TTL configurations
    this.ttl = {
      activeOrders: 24 * 60 * 60,    // 24 hours
      orderDetails: 6 * 60 * 60,     // 6 hours
      deliveryStatus: 2 * 60 * 60,   // 2 hours
      driverLocation: 5 * 60,        // 5 minutes
      orderHistory: 7 * 24 * 60 * 60, // 7 days
      emergencyOrders: 30 * 60,      // 30 minutes
      recurringOrders: 24 * 60 * 60, // 24 hours
      orderAnalytics: 60 * 60,       // 1 hour
      supplierOrders: 4 * 60 * 60,   // 4 hours
      cylinderTracking: 12 * 60 * 60, // 12 hours
    };
  }

  /**
   * Active Orders Management
   */
  async cacheActiveOrder(orderId, orderData) {
    const key = this.generateKey('active', orderId);
    const data = {
      ...orderData,
      cachedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.activeOrders);
  }

  async getActiveOrder(orderId) {
    const key = this.generateKey('active', orderId);
    return await this.get(key);
  }

  async updateActiveOrder(orderId, updates) {
    const key = this.generateKey('active', orderId);
    const existing = await this.get(key);
    
    if (existing) {
      const updated = {
        ...existing,
        ...updates,
        lastUpdated: new Date().toISOString()
      };
      
      return await this.set(key, updated, this.ttl.activeOrders);
    }
    
    return false;
  }

  async removeActiveOrder(orderId) {
    const key = this.generateKey('active', orderId);
    return await this.del(key);
  }

  /**
   * User Orders Caching
   */
  async cacheUserOrders(userId, orders, status = 'all') {
    const key = this.generateKey('user_orders', userId, status);
    return await this.set(key, orders, this.ttl.orderHistory);
  }

  async getUserOrders(userId, status = 'all') {
    const key = this.generateKey('user_orders', userId, status);
    return await this.get(key);
  }

  async invalidateUserOrders(userId) {
    const pattern = this.generateKey('user_orders', userId, '*');
    return await this.delPattern(pattern);
  }

  /**
   * Supplier Orders Caching
   */
  async cacheSupplierOrders(supplierId, orders, status = 'all') {
    const key = this.generateKey('supplier_orders', supplierId, status);
    return await this.set(key, orders, this.ttl.supplierOrders);
  }

  async getSupplierOrders(supplierId, status = 'all') {
    const key = this.generateKey('supplier_orders', supplierId, status);
    return await this.get(key);
  }

  async invalidateSupplierOrders(supplierId) {
    const pattern = this.generateKey('supplier_orders', supplierId, '*');
    return await this.delPattern(pattern);
  }

  /**
   * Delivery Tracking
   */
  async cacheDeliveryStatus(orderId, deliveryData) {
    const key = this.generateKey('delivery', orderId);
    const data = {
      ...deliveryData,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.deliveryStatus);
  }

  async getDeliveryStatus(orderId) {
    const key = this.generateKey('delivery', orderId);
    return await this.get(key);
  }

  async updateDeliveryStatus(orderId, statusUpdate) {
    const key = this.generateKey('delivery', orderId);
    const existing = await this.get(key);
    
    if (existing) {
      const updated = {
        ...existing,
        ...statusUpdate,
        lastUpdated: new Date().toISOString()
      };
      
      return await this.set(key, updated, this.ttl.deliveryStatus);
    }
    
    return false;
  }

  /**
   * Driver Location Tracking
   */
  async updateDriverLocation(driverId, orderId, location) {
    const key = this.generateKey('driver_location', driverId);
    const data = {
      driverId,
      orderId,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date().toISOString(),
      accuracy: location.accuracy || null,
      heading: location.heading || null,
      speed: location.speed || null
    };
    
    // Store current location
    await this.set(key, data, this.ttl.driverLocation);
    
    // Store in location history
    const historyKey = this.generateKey('driver_history', driverId, orderId);
    await this.lPush(historyKey, data);
    
    // Keep only last 100 locations
    await this.client.lTrim(historyKey, 0, 99);
    await this.expire(historyKey, this.ttl.deliveryStatus);
    
    return true;
  }

  async getDriverLocation(driverId) {
    const key = this.generateKey('driver_location', driverId);
    return await this.get(key);
  }

  async getDriverLocationHistory(driverId, orderId) {
    const key = this.generateKey('driver_history', driverId, orderId);
    return await this.lRange(key, 0, -1);
  }

  /**
   * Emergency Orders
   */
  async cacheEmergencyOrder(orderId, orderData) {
    const key = this.generateKey('emergency', orderId);
    const data = {
      ...orderData,
      priority: 'emergency',
      cachedAt: new Date().toISOString()
    };
    
    // Cache with shorter TTL for emergency orders
    return await this.set(key, data, this.ttl.emergencyOrders);
  }

  async getEmergencyOrders() {
    const pattern = this.generateKey('emergency', '*');
    const keys = await this.client.keys(pattern);
    
    const orders = [];
    for (const key of keys) {
      const order = await this.get(key);
      if (order) {
        orders.push(order);
      }
    }
    
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Recurring Orders
   */
  async cacheRecurringOrder(userId, recurringData) {
    const key = this.generateKey('recurring', userId);
    return await this.set(key, recurringData, this.ttl.recurringOrders);
  }

  async getRecurringOrders(userId) {
    const key = this.generateKey('recurring', userId);
    return await this.get(key);
  }

  async updateRecurringOrder(userId, updates) {
    const key = this.generateKey('recurring', userId);
    const existing = await this.get(key);
    
    if (existing) {
      const updated = {
        ...existing,
        ...updates,
        lastUpdated: new Date().toISOString()
      };
      
      return await this.set(key, updated, this.ttl.recurringOrders);
    }
    
    return false;
  }

  /**
   * Cylinder Tracking
   */
  async cacheCylinderStatus(cylinderId, statusData) {
    const key = this.generateKey('cylinder', cylinderId);
    const data = {
      ...statusData,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.cylinderTracking);
  }

  async getCylinderStatus(cylinderId) {
    const key = this.generateKey('cylinder', cylinderId);
    return await this.get(key);
  }

  async updateCylinderStatus(cylinderId, updates) {
    const key = this.generateKey('cylinder', cylinderId);
    const existing = await this.get(key);
    
    if (existing) {
      const updated = {
        ...existing,
        ...updates,
        lastUpdated: new Date().toISOString()
      };
      
      return await this.set(key, updated, this.ttl.cylinderTracking);
    }
    
    return false;
  }

  /**
   * Order Analytics
   */
  async cacheOrderAnalytics(key, analyticsData) {
    const cacheKey = this.generateKey('analytics', key);
    return await this.set(cacheKey, analyticsData, this.ttl.orderAnalytics);
  }

  async getOrderAnalytics(key) {
    const cacheKey = this.generateKey('analytics', key);
    return await this.get(cacheKey);
  }

  /**
   * Real-time Order Updates
   */
  async publishOrderUpdate(orderId, updateData) {
    const channel = `order_updates:${orderId}`;
    const message = {
      orderId,
      ...updateData,
      timestamp: new Date().toISOString()
    };
    
    // Store latest update
    const key = this.generateKey('updates', orderId);
    await this.set(key, message, this.ttl.deliveryStatus);
    
    // Publish to subscribers (if Redis pub/sub is configured)
    try {
      await this.client.publish(channel, JSON.stringify(message));
    } catch (error) {
      logger.warn('Failed to publish order update:', error);
    }
    
    return true;
  }

  async getLatestOrderUpdate(orderId) {
    const key = this.generateKey('updates', orderId);
    return await this.get(key);
  }

  /**
   * Order Queue Management
   */
  async addToOrderQueue(queueName, orderData) {
    const key = this.generateKey('queue', queueName);
    return await this.lPush(key, orderData);
  }

  async getFromOrderQueue(queueName, count = 1) {
    const key = this.generateKey('queue', queueName);
    return await this.lRange(key, 0, count - 1);
  }

  async removeFromOrderQueue(queueName, count = 1) {
    const key = this.generateKey('queue', queueName);
    const items = [];
    
    for (let i = 0; i < count; i++) {
      const item = await this.client.lPop(key);
      if (item) {
        try {
          items.push(JSON.parse(item));
        } catch {
          items.push(item);
        }
      } else {
        break;
      }
    }
    
    return items;
  }

  /**
   * Order Search Cache
   */
  async cacheOrderSearch(searchKey, results) {
    const key = this.generateKey('search', searchKey);
    return await this.set(key, results, 15 * 60); // 15 minutes
  }

  async getOrderSearch(searchKey) {
    const key = this.generateKey('search', searchKey);
    return await this.get(key);
  }

  /**
   * Bulk Cache Operations
   */
  async cacheMultipleOrders(orders) {
    const pipeline = this.client.multi();
    
    for (const order of orders) {
      const key = this.generateKey('active', order.id);
      pipeline.setEx(key, this.ttl.activeOrders, JSON.stringify(order));
    }
    
    await pipeline.exec();
    return orders.length;
  }

  /**
   * Cache Invalidation
   */
  async invalidateOrderCache(orderId) {
    const patterns = [
      this.generateKey('active', orderId),
      this.generateKey('delivery', orderId),
      this.generateKey('updates', orderId),
      this.generateKey('driver_history', '*', orderId)
    ];

    let deletedCount = 0;
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        deletedCount += await this.delPattern(pattern);
      } else {
        const deleted = await this.del(pattern);
        if (deleted) deletedCount++;
      }
    }

    logger.info(`Invalidated ${deletedCount} cache entries for order ${orderId}`);
    return deletedCount;
  }

  /**
   * Performance Metrics
   */
  async trackOrderMetrics(metric, value = 1) {
    const key = this.generateKey('metrics', metric);
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Store metric with timestamp
    await this.client.zAdd(key, { score: timestamp, value: value });
    
    // Keep only last 24 hours of metrics
    const cutoff = timestamp - (24 * 60 * 60);
    await this.client.zRemRangeByScore(key, 0, cutoff);
    
    return true;
  }

  async getOrderMetrics(metric, timeRange = 3600) {
    const key = this.generateKey('metrics', metric);
    const now = Math.floor(Date.now() / 1000);
    const start = now - timeRange;
    
    return await this.client.zRangeByScore(key, start, now);
  }

  /**
   * Health Check
   */
  async healthCheck() {
    try {
      const testKey = this.generateKey('health', 'test');
      const testValue = { timestamp: Date.now() };
      
      await this.set(testKey, testValue, 60);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        testPassed: retrieved && retrieved.timestamp === testValue.timestamp
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = OrdersCacheService;
