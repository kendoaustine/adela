const redis = require('redis');
const logger = require('../utils/logger');

/**
 * Centralized Cache Manager for GasConnect
 * Provides consistent caching patterns across all services
 */
class CacheManager {
  constructor(config = {}) {
    this.config = {
      url: config.url || process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: config.keyPrefix || 'gasconnect:',
      defaultTTL: config.defaultTTL || 3600, // 1 hour
      maxRetries: config.maxRetries || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      ...config
    };
    
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      this.client = redis.createClient({
        url: this.config.url,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server refused connection');
            return new Error('Redis server refused connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > this.config.maxRetries) {
            logger.error('Redis max retry attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.info('Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Generate cache key with proper naming convention
   */
  generateKey(namespace, identifier, subKey = null) {
    const parts = [this.config.keyPrefix, namespace, identifier];
    if (subKey) {
      parts.push(subKey);
    }
    return parts.join(':');
  }

  /**
   * Set cache value with TTL
   */
  async set(key, value, ttl = null) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set');
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('general', key);
      const expiry = ttl || this.config.defaultTTL;

      await this.client.setEx(cacheKey, expiry, serializedValue);
      logger.debug(`Cache set: ${cacheKey} (TTL: ${expiry}s)`);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get cache value
   */
  async get(key) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache get');
      return null;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('general', key);
      const value = await this.client.get(cacheKey);
      
      if (value === null) {
        logger.debug(`Cache miss: ${cacheKey}`);
        return null;
      }

      logger.debug(`Cache hit: ${cacheKey}`);
      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete cache key
   */
  async del(key) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache delete');
      return false;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('general', key);
      const result = await this.client.del(cacheKey);
      logger.debug(`Cache deleted: ${cacheKey}`);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delPattern(pattern) {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping pattern delete');
      return 0;
    }

    try {
      const searchPattern = pattern.startsWith(this.config.keyPrefix) ? pattern : `${this.config.keyPrefix}${pattern}`;
      const keys = await this.client.keys(searchPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);
      logger.debug(`Cache pattern deleted: ${searchPattern} (${result} keys)`);
      return result;
    } catch (error) {
      logger.error('Cache pattern delete error:', error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('general', key);
      const result = await this.client.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key, ttl) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('general', key);
      const result = await this.client.expire(cacheKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key) {
    if (!this.isConnected) {
      return -1;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('general', key);
      return await this.client.ttl(cacheKey);
    } catch (error) {
      logger.error('Cache TTL error:', error);
      return -1;
    }
  }

  /**
   * Increment counter
   */
  async incr(key, amount = 1) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('counters', key);
      const result = await this.client.incrBy(cacheKey, amount);
      logger.debug(`Cache incremented: ${cacheKey} by ${amount} = ${result}`);
      return result;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return null;
    }
  }

  /**
   * Set with expiration if not exists
   */
  async setNX(key, value, ttl = null) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('locks', key);
      const serializedValue = JSON.stringify(value);
      const expiry = ttl || this.config.defaultTTL;

      const result = await this.client.setNX(cacheKey, serializedValue);
      if (result && ttl) {
        await this.client.expire(cacheKey, expiry);
      }
      
      return result;
    } catch (error) {
      logger.error('Cache setNX error:', error);
      return false;
    }
  }

  /**
   * Hash operations
   */
  async hSet(key, field, value) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('hashes', key);
      const serializedValue = JSON.stringify(value);
      const result = await this.client.hSet(cacheKey, field, serializedValue);
      return result;
    } catch (error) {
      logger.error('Cache hSet error:', error);
      return false;
    }
  }

  async hGet(key, field) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('hashes', key);
      const value = await this.client.hGet(cacheKey, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache hGet error:', error);
      return null;
    }
  }

  async hGetAll(key) {
    if (!this.isConnected) {
      return {};
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('hashes', key);
      const hash = await this.client.hGetAll(cacheKey);
      
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Cache hGetAll error:', error);
      return {};
    }
  }

  /**
   * List operations
   */
  async lPush(key, ...values) {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('lists', key);
      const serializedValues = values.map(v => JSON.stringify(v));
      return await this.client.lPush(cacheKey, serializedValues);
    } catch (error) {
      logger.error('Cache lPush error:', error);
      return 0;
    }
  }

  async lRange(key, start = 0, stop = -1) {
    if (!this.isConnected) {
      return [];
    }

    try {
      const cacheKey = key.startsWith(this.config.keyPrefix) ? key : this.generateKey('lists', key);
      const values = await this.client.lRange(cacheKey, start, stop);
      return values.map(v => {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      });
    } catch (error) {
      logger.error('Cache lRange error:', error);
      return [];
    }
  }

  /**
   * Flush all cache
   */
  async flushAll() {
    if (!this.isConnected) {
      return false;
    }

    try {
      await this.client.flushAll();
      logger.info('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: info,
        keyspace: keyspace,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return null;
    }
  }

  /**
   * Close connection
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }
}

module.exports = CacheManager;
