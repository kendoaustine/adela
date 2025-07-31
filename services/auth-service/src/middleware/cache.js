const redis = require('../services/redis');
const logger = require('../utils/logger');

/**
 * Cache middleware for caching API responses
 */
const cache = (duration = 300) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Create cache key from URL and query parameters
    const cacheKey = `cache:${req.originalUrl || req.url}`;
    
    try {
      // Try to get cached response
      const cachedResponse = await redis.get(cacheKey);
      
      if (cachedResponse) {
        logger.debug('Cache hit', { key: cacheKey });
        
        const parsed = JSON.parse(cachedResponse);
        
        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
          'Cache-Control': `public, max-age=${duration}`
        });
        
        return res.status(parsed.statusCode).json(parsed.data);
      }
      
      // Cache miss - continue to route handler
      logger.debug('Cache miss', { key: cacheKey });
      
      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache the response
        const responseToCache = {
          statusCode: res.statusCode,
          data: data,
          timestamp: Date.now()
        };
        
        // Set cache asynchronously (don't wait)
        redis.setex(cacheKey, duration, JSON.stringify(responseToCache))
          .then(() => {
            logger.debug('Response cached', { key: cacheKey, duration });
          })
          .catch(err => {
            logger.warn('Failed to cache response', { key: cacheKey, error: err.message });
          });
        
        // Set cache headers
        res.set({
          'X-Cache': 'MISS',
          'X-Cache-Key': cacheKey,
          'Cache-Control': `public, max-age=${duration}`
        });
        
        // Call original json method
        return originalJson.call(this, data);
      };
      
      next();
      
    } catch (error) {
      logger.warn('Cache middleware error', { error: error.message });
      // Continue without caching on error
      next();
    }
  };
};

/**
 * Cache invalidation middleware
 */
const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    // Store patterns for post-request invalidation
    req.cacheInvalidationPatterns = patterns;
    
    // Override res.json to invalidate cache after successful response
    const originalJson = res.json;
    res.json = function(data) {
      // Call original json method first
      const result = originalJson.call(this, data);
      
      // Invalidate cache patterns if response was successful
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidateCachePatterns(req.cacheInvalidationPatterns)
          .catch(err => {
            logger.warn('Cache invalidation failed', { error: err.message });
          });
      }
      
      return result;
    };
    
    next();
  };
};

/**
 * Invalidate cache patterns
 */
const invalidateCachePatterns = async (patterns) => {
  if (!patterns || patterns.length === 0) {
    return;
  }
  
  try {
    for (const pattern of patterns) {
      const keys = await redis.keys(`cache:${pattern}`);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug('Cache invalidated', { pattern, keysCount: keys.length });
      }
    }
  } catch (error) {
    logger.error('Cache invalidation error', { error: error.message });
    throw error;
  }
};

/**
 * Clear all cache
 */
const clearCache = async () => {
  try {
    const keys = await redis.keys('cache:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('All cache cleared', { keysCount: keys.length });
    }
    return keys.length;
  } catch (error) {
    logger.error('Clear cache error', { error: error.message });
    throw error;
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = async () => {
  try {
    const keys = await redis.keys('cache:*');
    const stats = {
      totalKeys: keys.length,
      memoryUsage: await redis.memory('usage'),
      keysByPattern: {}
    };
    
    // Group keys by pattern
    keys.forEach(key => {
      const pattern = key.split(':')[1] || 'unknown';
      stats.keysByPattern[pattern] = (stats.keysByPattern[pattern] || 0) + 1;
    });
    
    return stats;
  } catch (error) {
    logger.error('Cache stats error', { error: error.message });
    throw error;
  }
};

module.exports = {
  cache,
  invalidateCache,
  invalidateCachePatterns,
  clearCache,
  getCacheStats
};
