const ServiceRegistry = require('../lib/service-clients/serviceRegistry');
const logger = require('../utils/logger');

/**
 * Service Manager for Orders Service
 * Manages all inter-service communication
 */
class ServiceManager {
  constructor() {
    this.registry = null;
    this.isInitialized = false;
  }

  /**
   * Initialize service registry
   */
  async initialize() {
    try {
      this.registry = ServiceRegistry.createDefault({
        // Auth Service configuration
        authServiceURL: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
        authServiceTimeout: 5000,
        authServiceRetries: 3,
        authServiceCacheTTL: 300, // 5 minutes
        
        // Supplier Service configuration
        supplierServiceURL: process.env.SUPPLIER_SERVICE_URL || 'http://supplier-service:3003',
        supplierServiceTimeout: 5000,
        supplierServiceRetries: 3,
        supplierServiceCacheTTL: 180, // 3 minutes (inventory changes more frequently)
        
        // Health check configuration
        enableHealthChecks: true,
        healthCheckInterval: 60000, // 1 minute
      });

      this.isInitialized = true;
      logger.info('Service manager initialized successfully');
      
      // Perform initial health check
      const healthResults = await this.registry.performHealthChecks();
      logger.info('Initial service health check completed', { healthResults });
      
    } catch (error) {
      logger.error('Failed to initialize service manager:', error);
      throw error;
    }
  }

  /**
   * Get Auth Service client
   */
  getAuthService() {
    this.ensureInitialized();
    return this.registry.getAuthService();
  }

  /**
   * Get Supplier Service client
   */
  getSupplierService() {
    this.ensureInitialized();
    return this.registry.getSupplierService();
  }

  /**
   * Validate user token and get user info
   */
  async validateUserToken(token) {
    try {
      const authService = this.getAuthService();
      const result = await authService.validateToken(token);
      
      if (!result.isValid) {
        throw new Error(result.error || 'Invalid token');
      }
      
      return {
        user: result.user,
        token: result.token
      };
    } catch (error) {
      logger.error('Token validation failed:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user addresses for delivery
   */
  async getUserAddresses(authToken) {
    try {
      const authService = this.getAuthService();
      return await authService.getUserAddresses(authToken);
    } catch (error) {
      logger.error('Failed to get user addresses:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get specific address by ID
   */
  async getAddressById(addressId, authToken) {
    try {
      const authService = this.getAuthService();
      return await authService.getAddressById(addressId, authToken);
    } catch (error) {
      logger.error('Failed to get address:', { addressId, error: error.message });
      throw error;
    }
  }

  /**
   * Check inventory availability for order items
   */
  async checkInventoryAvailability(supplierId, items, authToken) {
    try {
      const supplierService = this.getSupplierService();
      return await supplierService.checkInventoryAvailability(supplierId, items, authToken);
    } catch (error) {
      logger.error('Failed to check inventory availability:', { 
        supplierId, 
        itemCount: items.length, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Calculate order pricing
   */
  async calculateOrderPricing(supplierId, items, customerType, authToken) {
    try {
      const supplierService = this.getSupplierService();
      return await supplierService.calculateOrderPricing(supplierId, items, customerType, authToken);
    } catch (error) {
      logger.error('Failed to calculate order pricing:', { 
        supplierId, 
        customerType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Reserve inventory for order
   */
  async reserveInventory(supplierId, items, orderId, authToken) {
    try {
      const supplierService = this.getSupplierService();
      return await supplierService.reserveInventory(supplierId, items, orderId, authToken);
    } catch (error) {
      logger.error('Failed to reserve inventory:', { 
        supplierId, 
        orderId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update inventory quantities after order confirmation
   */
  async updateInventoryQuantities(supplierId, items, authToken) {
    try {
      const supplierService = this.getSupplierService();
      return await supplierService.updateInventoryQuantities(supplierId, items, authToken);
    } catch (error) {
      logger.error('Failed to update inventory quantities:', { 
        supplierId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get supplier information
   */
  async getSupplierInfo(supplierId, authToken) {
    try {
      const supplierService = this.getSupplierService();
      return await supplierService.getSupplierInfo(supplierId, authToken);
    } catch (error) {
      logger.error('Failed to get supplier info:', { 
        supplierId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth() {
    try {
      this.ensureInitialized();
      return await this.registry.getSystemHealth();
    } catch (error) {
      logger.error('Failed to get system health:', { error: error.message });
      throw error;
    }
  }

  /**
   * Clear all service caches
   */
  clearAllCaches() {
    if (this.isInitialized) {
      this.registry.clearAllCaches();
      logger.info('All service caches cleared');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isInitialized && this.registry) {
      await this.registry.shutdown();
      this.isInitialized = false;
      logger.info('Service manager shutdown complete');
    }
  }

  /**
   * Ensure service manager is initialized
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Service manager not initialized. Call initialize() first.');
    }
  }
}

// Create singleton instance
const serviceManager = new ServiceManager();

module.exports = serviceManager;
