const CacheManager = require('./CacheManager');
const logger = require('../utils/logger');

/**
 * Supplier Service Cache Layer
 * Handles caching for inventory, pricing, payments, and analytics
 */
class SupplierCacheService extends CacheManager {
  constructor(config = {}) {
    super({
      keyPrefix: 'gasconnect:supplier:',
      defaultTTL: 3600, // 1 hour
      ...config
    });

    // Cache TTL configurations
    this.ttl = {
      inventory: 60 * 60,           // 1 hour
      pricing: 4 * 60 * 60,         // 4 hours
      payments: 30 * 60,            // 30 minutes
      analytics: 24 * 60 * 60,      // 24 hours
      supplierProfile: 6 * 60 * 60, // 6 hours
      bundles: 2 * 60 * 60,         // 2 hours
      walletBalance: 5 * 60,        // 5 minutes
      lowStockAlerts: 15 * 60,      // 15 minutes
      priceHistory: 7 * 24 * 60 * 60, // 7 days
      salesMetrics: 60 * 60,        // 1 hour
    };
  }

  /**
   * Inventory Management
   */
  async cacheInventoryItem(supplierId, gasTypeId, cylinderSize, inventoryData) {
    const key = this.generateKey('inventory', supplierId, `${gasTypeId}:${cylinderSize}`);
    const data = {
      ...inventoryData,
      supplierId,
      gasTypeId,
      cylinderSize,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.inventory);
  }

  async getInventoryItem(supplierId, gasTypeId, cylinderSize) {
    const key = this.generateKey('inventory', supplierId, `${gasTypeId}:${cylinderSize}`);
    return await this.get(key);
  }

  async cacheSupplierInventory(supplierId, inventoryList) {
    const key = this.generateKey('inventory_list', supplierId);
    return await this.set(key, inventoryList, this.ttl.inventory);
  }

  async getSupplierInventory(supplierId) {
    const key = this.generateKey('inventory_list', supplierId);
    return await this.get(key);
  }

  async updateInventoryQuantity(supplierId, gasTypeId, cylinderSize, newQuantity) {
    const key = this.generateKey('inventory', supplierId, `${gasTypeId}:${cylinderSize}`);
    const existing = await this.get(key);
    
    if (existing) {
      const updated = {
        ...existing,
        quantityAvailable: newQuantity,
        lastUpdated: new Date().toISOString()
      };
      
      await this.set(key, updated, this.ttl.inventory);
      
      // Invalidate inventory list cache
      await this.del(this.generateKey('inventory_list', supplierId));
      
      return updated;
    }
    
    return null;
  }

  async invalidateSupplierInventory(supplierId) {
    const patterns = [
      this.generateKey('inventory', supplierId, '*'),
      this.generateKey('inventory_list', supplierId)
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

    return deletedCount;
  }

  /**
   * Low Stock Alerts
   */
  async cacheLowStockItems(supplierId, lowStockItems) {
    const key = this.generateKey('low_stock', supplierId);
    return await this.set(key, lowStockItems, this.ttl.lowStockAlerts);
  }

  async getLowStockItems(supplierId) {
    const key = this.generateKey('low_stock', supplierId);
    return await this.get(key);
  }

  async addLowStockAlert(supplierId, itemData) {
    const key = this.generateKey('low_stock_alerts', supplierId);
    const alertData = {
      ...itemData,
      alertTime: new Date().toISOString(),
      id: `${itemData.gasTypeId}:${itemData.cylinderSize}`
    };
    
    await this.lPush(key, alertData);
    await this.expire(key, this.ttl.lowStockAlerts);
    
    return true;
  }

  /**
   * Pricing Management
   */
  async cachePricingRule(supplierId, gasTypeId, cylinderSize, pricingData) {
    const key = this.generateKey('pricing', supplierId, `${gasTypeId}:${cylinderSize}`);
    const data = {
      ...pricingData,
      supplierId,
      gasTypeId,
      cylinderSize,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.pricing);
  }

  async getPricingRule(supplierId, gasTypeId, cylinderSize) {
    const key = this.generateKey('pricing', supplierId, `${gasTypeId}:${cylinderSize}`);
    return await this.get(key);
  }

  async cacheSupplierPricing(supplierId, pricingList) {
    const key = this.generateKey('pricing_list', supplierId);
    return await this.set(key, pricingList, this.ttl.pricing);
  }

  async getSupplierPricing(supplierId) {
    const key = this.generateKey('pricing_list', supplierId);
    return await this.get(key);
  }

  async invalidateSupplierPricing(supplierId) {
    const patterns = [
      this.generateKey('pricing', supplierId, '*'),
      this.generateKey('pricing_list', supplierId)
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

    return deletedCount;
  }

  /**
   * Price History
   */
  async addPriceHistory(supplierId, gasTypeId, cylinderSize, priceData) {
    const key = this.generateKey('price_history', supplierId, `${gasTypeId}:${cylinderSize}`);
    const historyEntry = {
      ...priceData,
      timestamp: new Date().toISOString()
    };
    
    await this.lPush(key, historyEntry);
    
    // Keep only last 100 price changes
    await this.client.lTrim(key, 0, 99);
    await this.expire(key, this.ttl.priceHistory);
    
    return true;
  }

  async getPriceHistory(supplierId, gasTypeId, cylinderSize) {
    const key = this.generateKey('price_history', supplierId, `${gasTypeId}:${cylinderSize}`);
    return await this.lRange(key, 0, -1);
  }

  /**
   * Promotional Bundles
   */
  async cacheBundle(supplierId, bundleId, bundleData) {
    const key = this.generateKey('bundles', supplierId, bundleId);
    const data = {
      ...bundleData,
      supplierId,
      bundleId,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.bundles);
  }

  async getBundle(supplierId, bundleId) {
    const key = this.generateKey('bundles', supplierId, bundleId);
    return await this.get(key);
  }

  async cacheSupplierBundles(supplierId, bundles) {
    const key = this.generateKey('bundles_list', supplierId);
    return await this.set(key, bundles, this.ttl.bundles);
  }

  async getSupplierBundles(supplierId) {
    const key = this.generateKey('bundles_list', supplierId);
    return await this.get(key);
  }

  async invalidateSupplierBundles(supplierId) {
    const patterns = [
      this.generateKey('bundles', supplierId, '*'),
      this.generateKey('bundles_list', supplierId)
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

    return deletedCount;
  }

  /**
   * Payment & Wallet Management
   */
  async cacheWalletBalance(supplierId, balanceData) {
    const key = this.generateKey('wallet', supplierId);
    const data = {
      ...balanceData,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.walletBalance);
  }

  async getWalletBalance(supplierId) {
    const key = this.generateKey('wallet', supplierId);
    return await this.get(key);
  }

  async updateWalletBalance(supplierId, newBalance, transactionData = {}) {
    const key = this.generateKey('wallet', supplierId);
    const data = {
      balance: newBalance,
      currency: 'NGN',
      ...transactionData,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.walletBalance);
  }

  async cachePaymentHistory(supplierId, payments) {
    const key = this.generateKey('payments', supplierId);
    return await this.set(key, payments, this.ttl.payments);
  }

  async getPaymentHistory(supplierId) {
    const key = this.generateKey('payments', supplierId);
    return await this.get(key);
  }

  /**
   * Analytics & Metrics
   */
  async cacheAnalytics(supplierId, analyticsType, data) {
    const key = this.generateKey('analytics', supplierId, analyticsType);
    const analyticsData = {
      ...data,
      type: analyticsType,
      generatedAt: new Date().toISOString()
    };
    
    return await this.set(key, analyticsData, this.ttl.analytics);
  }

  async getAnalytics(supplierId, analyticsType) {
    const key = this.generateKey('analytics', supplierId, analyticsType);
    return await this.get(key);
  }

  async cacheDashboardData(supplierId, dashboardData) {
    const key = this.generateKey('dashboard', supplierId);
    return await this.set(key, dashboardData, this.ttl.analytics);
  }

  async getDashboardData(supplierId) {
    const key = this.generateKey('dashboard', supplierId);
    return await this.get(key);
  }

  /**
   * Sales Metrics
   */
  async trackSaleMetric(supplierId, metric, value = 1) {
    const key = this.generateKey('sales_metrics', supplierId, metric);
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Store metric with timestamp
    await this.client.zAdd(key, { score: timestamp, value: value });
    
    // Keep only last 30 days of metrics
    const cutoff = timestamp - (30 * 24 * 60 * 60);
    await this.client.zRemRangeByScore(key, 0, cutoff);
    
    return true;
  }

  async getSalesMetrics(supplierId, metric, timeRange = 86400) {
    const key = this.generateKey('sales_metrics', supplierId, metric);
    const now = Math.floor(Date.now() / 1000);
    const start = now - timeRange;
    
    return await this.client.zRangeByScore(key, start, now);
  }

  /**
   * Supplier Profile
   */
  async cacheSupplierProfile(supplierId, profileData) {
    const key = this.generateKey('profile', supplierId);
    const data = {
      ...profileData,
      lastUpdated: new Date().toISOString()
    };
    
    return await this.set(key, data, this.ttl.supplierProfile);
  }

  async getSupplierProfile(supplierId) {
    const key = this.generateKey('profile', supplierId);
    return await this.get(key);
  }

  async invalidateSupplierProfile(supplierId) {
    const key = this.generateKey('profile', supplierId);
    return await this.del(key);
  }

  /**
   * Search & Filtering
   */
  async cacheSearchResults(searchKey, results) {
    const key = this.generateKey('search', searchKey);
    return await this.set(key, results, 15 * 60); // 15 minutes
  }

  async getSearchResults(searchKey) {
    const key = this.generateKey('search', searchKey);
    return await this.get(key);
  }

  /**
   * Bulk Operations
   */
  async cacheMultipleInventoryItems(supplierId, inventoryItems) {
    const pipeline = this.client.multi();
    
    for (const item of inventoryItems) {
      const key = this.generateKey('inventory', supplierId, `${item.gasTypeId}:${item.cylinderSize}`);
      pipeline.setEx(key, this.ttl.inventory, JSON.stringify(item));
    }
    
    await pipeline.exec();
    return inventoryItems.length;
  }

  /**
   * Cache Invalidation
   */
  async invalidateSupplierCache(supplierId) {
    const patterns = [
      this.generateKey('inventory', supplierId, '*'),
      this.generateKey('inventory_list', supplierId),
      this.generateKey('pricing', supplierId, '*'),
      this.generateKey('pricing_list', supplierId),
      this.generateKey('bundles', supplierId, '*'),
      this.generateKey('bundles_list', supplierId),
      this.generateKey('wallet', supplierId),
      this.generateKey('payments', supplierId),
      this.generateKey('analytics', supplierId, '*'),
      this.generateKey('dashboard', supplierId),
      this.generateKey('profile', supplierId)
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

    logger.info(`Invalidated ${deletedCount} cache entries for supplier ${supplierId}`);
    return deletedCount;
  }

  /**
   * Performance Monitoring
   */
  async trackPerformanceMetric(supplierId, metric, value, tags = {}) {
    const key = this.generateKey('performance', supplierId, metric);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const data = {
      value,
      tags,
      timestamp
    };
    
    await this.client.zAdd(key, { score: timestamp, value: JSON.stringify(data) });
    
    // Keep only last 24 hours
    const cutoff = timestamp - (24 * 60 * 60);
    await this.client.zRemRangeByScore(key, 0, cutoff);
    
    return true;
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

module.exports = SupplierCacheService;
