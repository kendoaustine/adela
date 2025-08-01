const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('./logger');

/**
 * Circuit Breaker implementation for service resilience
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
      }
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return this.state;
  }
}

/**
 * HTTP Client with circuit breaker, retry logic, and caching
 */
class ServiceHttpClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL;
    this.timeout = options.timeout || 5000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    
    // Cache configuration
    this.cache = new NodeCache({
      stdTTL: options.cacheTTL || 300, // 5 minutes default
      checkperiod: 60, // Check for expired keys every minute
      useClones: false
    });

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `GasConnect-Service/${options.serviceName || 'unknown'}`
      }
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('HTTP Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          timeout: config.timeout
        });
        return config;
      },
      (error) => {
        logger.error('HTTP Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('HTTP Response', {
          status: response.status,
          url: response.config.url,
          responseTime: response.headers['x-response-time']
        });
        return response;
      },
      (error) => {
        logger.error('HTTP Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate cache key
   */
  getCacheKey(method, url, params = {}) {
    const paramString = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
    return `${method}:${url}:${paramString}`;
  }

  /**
   * Execute HTTP request with circuit breaker and retry logic
   */
  async request(config, options = {}) {
    const { useCache = true, cacheTTL, retryAttempts = this.retryAttempts } = options;
    
    // Check cache for GET requests
    if (config.method === 'GET' && useCache) {
      const cacheKey = this.getCacheKey(config.method, config.url, config.params);
      const cachedResponse = this.cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug('Cache hit', { cacheKey });
        return cachedResponse;
      }
    }

    return this.circuitBreaker.execute(async () => {
      let lastError;
      
      for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
          const response = await this.client.request(config);
          
          // Cache successful GET responses
          if (config.method === 'GET' && useCache) {
            const cacheKey = this.getCacheKey(config.method, config.url, config.params);
            const ttl = cacheTTL || this.cache.options.stdTTL;
            this.cache.set(cacheKey, response.data, ttl);
            logger.debug('Response cached', { cacheKey, ttl });
          }
          
          return response.data;
        } catch (error) {
          lastError = error;
          
          // Don't retry on 4xx errors (client errors)
          if (error.response && error.response.status >= 400 && error.response.status < 500) {
            throw error;
          }
          
          // Don't retry on last attempt
          if (attempt === retryAttempts) {
            throw error;
          }
          
          // Wait before retry with exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(`Request failed, retrying in ${delay}ms`, {
            attempt,
            maxAttempts: retryAttempts,
            error: error.message,
            url: config.url
          });
          
          await this.sleep(delay);
        }
      }
      
      throw lastError;
    });
  }

  /**
   * GET request
   */
  async get(url, params = {}, options = {}) {
    return this.request({
      method: 'GET',
      url,
      params
    }, options);
  }

  /**
   * POST request
   */
  async post(url, data = {}, options = {}) {
    return this.request({
      method: 'POST',
      url,
      data
    }, { ...options, useCache: false });
  }

  /**
   * PUT request
   */
  async put(url, data = {}, options = {}) {
    return this.request({
      method: 'PUT',
      url,
      data
    }, { ...options, useCache: false });
  }

  /**
   * DELETE request
   */
  async delete(url, options = {}) {
    return this.request({
      method: 'DELETE',
      url
    }, { ...options, useCache: false });
  }

  /**
   * Set authorization header
   */
  setAuthToken(token) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear cache
   */
  clearCache(pattern = null) {
    if (pattern) {
      const keys = this.cache.keys().filter(key => key.includes(pattern));
      this.cache.del(keys);
      logger.debug('Cache cleared', { pattern, keysCleared: keys.length });
    } else {
      this.cache.flushAll();
      logger.debug('All cache cleared');
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      state: this.circuitBreaker.getState(),
      failureCount: this.circuitBreaker.failureCount,
      lastFailureTime: this.circuitBreaker.lastFailureTime
    };
  }
}

module.exports = ServiceHttpClient;
