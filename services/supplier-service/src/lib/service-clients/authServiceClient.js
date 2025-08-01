const ServiceHttpClient = require('../http-client/index');

/**
 * Auth Service Client
 * Handles all communication with the Auth Service
 */
class AuthServiceClient {
  constructor(options = {}) {
    const baseURL = options.baseURL || process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
    
    this.client = new ServiceHttpClient({
      baseURL,
      serviceName: 'auth-service-client',
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
   * Validate JWT token and get user info
   */
  async validateToken(token) {
    try {
      // Set token for this request
      const tempClient = new ServiceHttpClient({
        baseURL: this.client.baseURL,
        serviceName: 'auth-service-client',
        timeout: 5000
      });
      tempClient.setAuthToken(token);

      const response = await tempClient.get('/api/v1/auth/validate', {}, {
        useCache: false, // Don't cache token validation
        retryAttempts: 2
      });

      return {
        isValid: true,
        user: response.user,
        token: response.token
      };
    } catch (error) {
      if (error.response && error.response.status === 401) {
        return {
          isValid: false,
          error: 'Invalid or expired token'
        };
      }
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/profiles', {}, {
        cacheTTL: 600 // Cache for 10 minutes
      });

      return response.profile;
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Get user addresses
   */
  async getUserAddresses(authToken, options = {}) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/addresses', {
        limit: options.limit || 20,
        offset: options.offset || 0
      }, {
        cacheTTL: 300 // Cache for 5 minutes
      });

      return {
        addresses: response.addresses,
        pagination: response.pagination
      };
    } catch (error) {
      throw new Error(`Failed to get user addresses: ${error.message}`);
    }
  }

  /**
   * Get specific address by ID
   */
  async getAddressById(addressId, authToken) {
    try {
      this.setAuthToken(authToken);
      
      const addresses = await this.getUserAddresses(authToken);
      const address = addresses.addresses.find(addr => addr.id === addressId);
      
      if (!address) {
        throw new Error('Address not found');
      }
      
      return address;
    } catch (error) {
      throw new Error(`Failed to get address: ${error.message}`);
    }
  }

  /**
   * Verify user has specific role
   */
  async verifyUserRole(userId, requiredRole, authToken) {
    try {
      const profile = await this.getUserProfile(userId, authToken);
      return profile.role === requiredRole;
    } catch (error) {
      throw new Error(`Failed to verify user role: ${error.message}`);
    }
  }

  /**
   * Get supplier verification status
   */
  async getSupplierVerificationStatus(authToken) {
    try {
      this.setAuthToken(authToken);
      
      const response = await this.client.get('/api/v1/suppliers/verification-status', {}, {
        cacheTTL: 180 // Cache for 3 minutes
      });

      return response;
    } catch (error) {
      throw new Error(`Failed to get supplier verification status: ${error.message}`);
    }
  }

  /**
   * Batch get user profiles (for order lists, etc.)
   */
  async batchGetUserProfiles(userIds, authToken) {
    try {
      // For now, get profiles individually
      // In a production system, you'd implement a batch endpoint
      const profiles = {};
      
      for (const userId of userIds) {
        try {
          const profile = await this.getUserProfile(userId, authToken);
          profiles[userId] = profile;
        } catch (error) {
          // Log error but continue with other profiles
          console.warn(`Failed to get profile for user ${userId}:`, error.message);
          profiles[userId] = null;
        }
      }
      
      return profiles;
    } catch (error) {
      throw new Error(`Failed to batch get user profiles: ${error.message}`);
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
        service: 'auth-service',
        circuitBreaker: this.client.getCircuitBreakerStatus(),
        response
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'auth-service',
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

module.exports = AuthServiceClient;
