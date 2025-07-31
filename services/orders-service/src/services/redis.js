const redis = require('redis');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;

/**
 * Create and configure Redis client
 */
const createClient = () => {
  if (client) {
    return client;
  }

  const redisConfig = {
    url: config.redis.url,
    password: config.redis.password || undefined,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis reconnection failed after 10 attempts');
          return new Error('Redis reconnection failed');
        }
        return Math.min(retries * 50, 1000);
      },
    },
  };

  client = redis.createClient(redisConfig);

  // Handle Redis events
  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  client.on('end', () => {
    logger.info('Redis client disconnected');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  return client;
};

/**
 * Connect to Redis
 */
const connectRedis = async () => {
  try {
    const redisClient = createClient();
    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    
    logger.info('Redis connected successfully');
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

/**
 * Get the Redis client instance
 */
const getClient = () => {
  if (!client || !client.isOpen) {
    throw new Error('Redis client not connected. Call connectRedis() first.');
  }
  return client;
};

/**
 * Session management functions
 */
const sessionService = {
  /**
   * Store user session
   */
  async setSession(userId, sessionData, ttl = config.redis.ttl.session) {
    const key = `${config.redis.keyPrefix}session:${userId}`;
    const redisClient = getClient();
    
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(sessionData));
      logger.debug('Session stored', { userId, ttl });
    } catch (error) {
      logger.error('Failed to store session:', error);
      throw error;
    }
  },

  /**
   * Get user session
   */
  async getSession(userId) {
    const key = `${config.redis.keyPrefix}session:${userId}`;
    const redisClient = getClient();
    
    try {
      const sessionData = await redisClient.get(key);
      if (sessionData) {
        return JSON.parse(sessionData);
      }
      return null;
    } catch (error) {
      logger.error('Failed to get session:', error);
      throw error;
    }
  },

  /**
   * Delete user session
   */
  async deleteSession(userId) {
    const key = `${config.redis.keyPrefix}session:${userId}`;
    const redisClient = getClient();
    
    try {
      await redisClient.del(key);
      logger.debug('Session deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete session:', error);
      throw error;
    }
  },

  /**
   * Extend session TTL
   */
  async extendSession(userId, ttl = config.redis.ttl.session) {
    const key = `${config.redis.keyPrefix}session:${userId}`;
    const redisClient = getClient();
    
    try {
      await redisClient.expire(key, ttl);
      logger.debug('Session extended', { userId, ttl });
    } catch (error) {
      logger.error('Failed to extend session:', error);
      throw error;
    }
  },
};

/**
 * OTP management functions
 */
const otpService = {
  /**
   * Store OTP
   */
  async setOTP(phone, otp, purpose, ttl = config.redis.ttl.otp) {
    const key = `${config.redis.keyPrefix}otp:${phone}:${purpose}`;
    const redisClient = getClient();
    
    try {
      await redisClient.setEx(key, ttl, otp);
      logger.debug('OTP stored', { phone, purpose, ttl });
    } catch (error) {
      logger.error('Failed to store OTP:', error);
      throw error;
    }
  },

  /**
   * Get and verify OTP
   */
  async verifyOTP(phone, otp, purpose) {
    const key = `${config.redis.keyPrefix}otp:${phone}:${purpose}`;
    const redisClient = getClient();
    
    try {
      const storedOTP = await redisClient.get(key);
      if (storedOTP && storedOTP === otp) {
        // Delete OTP after successful verification
        await redisClient.del(key);
        logger.debug('OTP verified and deleted', { phone, purpose });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to verify OTP:', error);
      throw error;
    }
  },

  /**
   * Delete OTP
   */
  async deleteOTP(phone, purpose) {
    const key = `${config.redis.keyPrefix}otp:${phone}:${purpose}`;
    const redisClient = getClient();
    
    try {
      await redisClient.del(key);
      logger.debug('OTP deleted', { phone, purpose });
    } catch (error) {
      logger.error('Failed to delete OTP:', error);
      throw error;
    }
  },
};

/**
 * Rate limiting functions
 */
const rateLimitService = {
  /**
   * Check and increment rate limit counter
   */
  async checkRateLimit(identifier, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const key = `${config.redis.keyPrefix}ratelimit:${identifier}`;
    const redisClient = getClient();
    
    try {
      const current = await redisClient.incr(key);
      
      if (current === 1) {
        // First attempt, set expiration
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }
      
      const ttl = await redisClient.ttl(key);
      
      return {
        attempts: current,
        maxAttempts,
        remaining: Math.max(0, maxAttempts - current),
        resetTime: Date.now() + (ttl * 1000),
        blocked: current > maxAttempts,
      };
    } catch (error) {
      logger.error('Failed to check rate limit:', error);
      throw error;
    }
  },

  /**
   * Reset rate limit counter
   */
  async resetRateLimit(identifier) {
    const key = `${config.redis.keyPrefix}ratelimit:${identifier}`;
    const redisClient = getClient();
    
    try {
      await redisClient.del(key);
      logger.debug('Rate limit reset', { identifier });
    } catch (error) {
      logger.error('Failed to reset rate limit:', error);
      throw error;
    }
  },
};

/**
 * Cache management functions
 */
const cacheService = {
  /**
   * Set cache value
   */
  async set(key, value, ttl = 3600) {
    const cacheKey = `${config.redis.keyPrefix}cache:${key}`;
    const redisClient = getClient();
    
    try {
      await redisClient.setEx(cacheKey, ttl, JSON.stringify(value));
      logger.debug('Cache set', { key, ttl });
    } catch (error) {
      logger.error('Failed to set cache:', error);
      throw error;
    }
  },

  /**
   * Get cache value
   */
  async get(key) {
    const cacheKey = `${config.redis.keyPrefix}cache:${key}`;
    const redisClient = getClient();
    
    try {
      const value = await redisClient.get(cacheKey);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      logger.error('Failed to get cache:', error);
      throw error;
    }
  },

  /**
   * Delete cache value
   */
  async del(key) {
    const cacheKey = `${config.redis.keyPrefix}cache:${key}`;
    const redisClient = getClient();
    
    try {
      await redisClient.del(cacheKey);
      logger.debug('Cache deleted', { key });
    } catch (error) {
      logger.error('Failed to delete cache:', error);
      throw error;
    }
  },
};

/**
 * Close Redis connection
 */
const closeRedis = async () => {
  if (client && client.isOpen) {
    await client.quit();
    client = null;
    logger.info('Redis connection closed');
  }
};

/**
 * Check Redis health
 */
const checkHealth = async () => {
  try {
    const redisClient = getClient();
    await redisClient.ping();
    return {
      status: 'healthy',
      message: 'Redis connection is working',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

module.exports = {
  connectRedis,
  getClient,
  sessionService,
  otpService,
  rateLimitService,
  cacheService,
  closeRedis,
  checkHealth,
};
