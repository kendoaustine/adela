const ServiceHttpClient = require('../http-client');

/**
 * Supplier Service Client
 * Handles all communication with the Supplier Service
 */
class SupplierServiceClient {
  constructor(options = {}) {
    const baseURL = options.baseURL || process.env.SUPPLIER_SERVICE_URL || 'http://supplier-service:3003';
    
    this.client = new ServiceHttpClient({
      baseURL,
      serviceName: 'supplier-service-client',
      timeout: options.timeout || 5000,
      retryAttempts: options.retryAttempts || 3,
      cacheTTL: options.cacheTTL || 300, // 5 minutes
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
      }
    });
  }

  /**
   * Set authentication token for requests
   */
  setAuthToken(token) {
    this.client.setAuthToken(token);
  }

  /**
   * Get supplier inventory
   */
  async getInventory(authToken, options = {}) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/inventory', {
        gasType: options.gasType,
        lowStock: options.lowStock,
        limit: options.limit || 20,
        offset: options.offset || 0
      }, {
        cacheTTL: 180 // Cache for 3 minutes (inventory changes frequently)
      });

      return {
        inventory: response.inventory,
        pagination: response.pagination,
        summary: response.summary
      };
    } catch (error) {
      throw new Error(`Failed to get supplier inventory: ${error.message}`);
    }
  }

  /**
   * Check inventory availability for specific items
   */
  async checkInventoryAvailability(supplierId, items, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const inventory = await this.getInventory(authToken);
      const availability = {};
      
      for (const item of items) {
        const inventoryItem = inventory.inventory.find(inv => 
          inv.gasType.id === item.gasTypeId && 
          inv.cylinderSize === item.cylinderSize
        );
        
        availability[`${item.gasTypeId}-${item.cylinderSize}`] = {
          available: inventoryItem ? inventoryItem.quantityAvailable >= item.quantity : false,
          quantityAvailable: inventoryItem ? inventoryItem.quantityAvailable : 0,
          unitCost: inventoryItem ? inventoryItem.unitCost : null,
          isLowStock: inventoryItem ? inventoryItem.isLowStock : true
        };
      }
      
      return availability;
    } catch (error) {
      throw new Error(`Failed to check inventory availability: ${error.message}`);
    }
  }

  /**
   * Get pricing information
   */
  async getPricing(authToken, options = {}) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/pricing', {
        gasType: options.gasType,
        customerType: options.customerType,
        quantity: options.quantity,
        limit: options.limit || 20,
        offset: options.offset || 0
      }, {
        cacheTTL: 600 // Cache for 10 minutes (pricing changes less frequently)
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to get pricing: ${error.message}`);
    }
  }

  /**
   * Calculate order pricing
   */
  async calculateOrderPricing(supplierId, items, customerType, authToken) {
    try {
      this.setAuthToken(authToken);
      
      // Get pricing rules for this supplier
      const pricing = await this.getPricing(authToken, { customerType });
      
      let subtotal = 0;
      const itemPricing = [];
      
      for (const item of items) {
        // Find applicable pricing rule
        const priceRule = pricing.pricing?.find(rule => 
          rule.gasTypeId === item.gasTypeId &&
          (!rule.cylinderSize || rule.cylinderSize === item.cylinderSize) &&
          (!rule.minQuantity || item.quantity >= rule.minQuantity)
        );
        
        const unitPrice = priceRule ? priceRule.price : item.unitPrice || 0;
        const totalPrice = unitPrice * item.quantity;
        
        itemPricing.push({
          gasTypeId: item.gasTypeId,
          cylinderSize: item.cylinderSize,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
          priceRuleId: priceRule?.id || null
        });
        
        subtotal += totalPrice;
      }
      
      return {
        subtotal,
        items: itemPricing,
        currency: 'NGN'
      };
    } catch (error) {
      throw new Error(`Failed to calculate order pricing: ${error.message}`);
    }
  }

  /**
   * Get supplier analytics
   */
  async getAnalytics(authToken, options = {}) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/analytics', {
        period: options.period || 'month',
        startDate: options.startDate,
        endDate: options.endDate
      }, {
        cacheTTL: 1800 // Cache for 30 minutes (analytics are less time-sensitive)
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to get supplier analytics: ${error.message}`);
    }
  }

  /**
   * Get promotional bundles
   */
  async getPromotionalBundles(authToken, options = {}) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/bundles', {
        targetAudience: options.targetAudience,
        isActive: options.isActive !== false, // Default to active bundles
        limit: options.limit || 20,
        offset: options.offset || 0
      }, {
        cacheTTL: 900 // Cache for 15 minutes
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to get promotional bundles: ${error.message}`);
    }
  }

  /**
   * Reserve inventory for order
   */
  async reserveInventory(supplierId, items, orderId, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.post('/api/v1/inventory/reserve', {
        supplierId,
        items,
        orderId,
        reservationDuration: 15 * 60 * 1000 // 15 minutes
      }, {
        retryAttempts: 2 // Inventory operations are critical
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to reserve inventory: ${error.message}`);
    }
  }

  /**
   * Release inventory reservation
   */
  async releaseInventoryReservation(reservationId, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.delete(`/api/v1/inventory/reservations/${reservationId}`);
      return response;
    } catch (error) {
      throw new Error(`Failed to release inventory reservation: ${error.message}`);
    }
  }

  /**
   * Update inventory quantities (after order confirmation)
   */
  async updateInventoryQuantities(supplierId, items, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.post('/api/v1/inventory/update-quantities', {
        supplierId,
        items
      }, {
        retryAttempts: 3 // Critical operation
      });

      // Clear inventory cache after update
      this.client.clearCache('inventory');
      
      return response;
    } catch (error) {
      throw new Error(`Failed to update inventory quantities: ${error.message}`);
    }
  }

  /**
   * Get supplier business information
   */
  async getSupplierInfo(supplierId, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get(`/api/v1/suppliers/${supplierId}`, {}, {
        cacheTTL: 1800 // Cache for 30 minutes (supplier info changes rarely)
      });

      return response.supplier;
    } catch (error) {
      throw new Error(`Failed to get supplier info: ${error.message}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health', {}, {
        useCache: false,
        retryAttempts: 1
      });
      
      return {
        status: 'healthy',
        service: 'supplier-service',
        circuitBreaker: this.client.getCircuitBreakerStatus(),
        response
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'supplier-service',
        circuitBreaker: this.client.getCircuitBreakerStatus(),
        error: error.message
      };
    }
  }

  /**
   * Clear cache
   */
  clearCache(pattern = null) {
    this.client.clearCache(pattern);
  }
}

module.exports = SupplierServiceClient;
