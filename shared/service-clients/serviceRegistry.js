const AuthServiceClient = require('./authServiceClient');
const SupplierServiceClient = require('./supplierServiceClient');

/**
 * Service Registry
 * Central registry for all service clients with health monitoring
 */
class ServiceRegistry {
  constructor(options = {}) {
    this.services = {};
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute
    this.healthCheckTimer = null;
    
    this.initializeServices(options);
    
    if (options.enableHealthChecks !== false) {
      this.startHealthChecks();
    }
  }

  /**
   * Initialize all service clients
   */
  initializeServices(options) {
    // Auth Service Client
    this.services.auth = new AuthServiceClient({
      baseURL: options.authServiceURL,
      timeout: options.authServiceTimeout,
      retryAttempts: options.authServiceRetries,
      cacheTTL: options.authServiceCacheTTL
    });

    // Supplier Service Client
    this.services.supplier = new SupplierServiceClient({
      baseURL: options.supplierServiceURL,
      timeout: options.supplierServiceTimeout,
      retryAttempts: options.supplierServiceRetries,
      cacheTTL: options.supplierServiceCacheTTL
    });
  }

  /**
   * Get Auth Service client
   */
  getAuthService() {
    return this.services.auth;
  }

  /**
   * Get Supplier Service client
   */
  getSupplierService() {
    return this.services.supplier;
  }

  /**
   * Set authentication token for all services
   */
  setAuthToken(token) {
    Object.values(this.services).forEach(service => {
      if (service.setAuthToken) {
        service.setAuthToken(token);
      }
    });
  }

  /**
   * Perform health checks on all services
   */
  async performHealthChecks() {
    const healthResults = {};
    
    for (const [serviceName, serviceClient] of Object.entries(this.services)) {
      try {
        if (serviceClient.healthCheck) {
          healthResults[serviceName] = await serviceClient.healthCheck();
        } else {
          healthResults[serviceName] = {
            status: 'unknown',
            service: serviceName,
            error: 'Health check not implemented'
          };
        }
      } catch (error) {
        healthResults[serviceName] = {
          status: 'error',
          service: serviceName,
          error: error.message
        };
      }
    }
    
    return healthResults;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      try {
        const healthResults = await this.performHealthChecks();
        const unhealthyServices = Object.entries(healthResults)
          .filter(([, result]) => result.status !== 'healthy')
          .map(([serviceName]) => serviceName);
        
        if (unhealthyServices.length > 0) {
          console.warn('Unhealthy services detected:', {
            unhealthyServices,
            healthResults
          });
        }
      } catch (error) {
        console.error('Health check failed:', error.message);
      }
    }, this.healthCheckInterval);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Clear all service caches
   */
  clearAllCaches() {
    Object.values(this.services).forEach(service => {
      if (service.clearCache) {
        service.clearCache();
      }
    });
  }

  /**
   * Get overall system health
   */
  async getSystemHealth() {
    const healthResults = await this.performHealthChecks();
    const totalServices = Object.keys(healthResults).length;
    const healthyServices = Object.values(healthResults)
      .filter(result => result.status === 'healthy').length;
    
    return {
      overall: healthyServices === totalServices ? 'healthy' : 'degraded',
      services: healthResults,
      summary: {
        total: totalServices,
        healthy: healthyServices,
        unhealthy: totalServices - healthyServices,
        healthPercentage: Math.round((healthyServices / totalServices) * 100)
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create service registry instance with default configuration
   */
  static createDefault(overrides = {}) {
    return new ServiceRegistry({
      // Auth Service configuration
      authServiceURL: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      authServiceTimeout: 5000,
      authServiceRetries: 3,
      authServiceCacheTTL: 300,
      
      // Supplier Service configuration
      supplierServiceURL: process.env.SUPPLIER_SERVICE_URL || 'http://supplier-service:3003',
      supplierServiceTimeout: 5000,
      supplierServiceRetries: 3,
      supplierServiceCacheTTL: 300,
      
      // Health check configuration
      enableHealthChecks: true,
      healthCheckInterval: 60000, // 1 minute
      
      ...overrides
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.stopHealthChecks();
    
    // Clear all caches
    this.clearAllCaches();
    
    console.info('Service registry shutdown complete');
  }
}

module.exports = ServiceRegistry;
