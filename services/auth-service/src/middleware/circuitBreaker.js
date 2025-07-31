const logger = require('../utils/logger');

/**
 * Simple Circuit Breaker implementation
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    this.expectedErrors = options.expectedErrors || [];
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.requestCount = 0;
    
    // Reset counters periodically
    setInterval(() => {
      this.resetCounters();
    }, this.monitoringPeriod);
  }

  async execute(operation, fallback = null) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        logger.warn('Circuit breaker is OPEN, executing fallback');
        if (fallback) {
          return await fallback();
        }
        throw new Error('Circuit breaker is OPEN and no fallback provided');
      }
    }

    this.requestCount++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      logger.info('Circuit breaker reset to CLOSED state after successful operation');
    }
  }

  onFailure(error) {
    // Don't count expected errors as failures
    if (this.expectedErrors.some(expectedError => error.message.includes(expectedError))) {
      return;
    }

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.error(`Circuit breaker opened after ${this.failureCount} failures`, {
        error: error.message,
        state: this.state
      });
    }
  }

  resetCounters() {
    this.requestCount = 0;
    this.successCount = 0;
    
    // Only reset failure count if circuit is closed
    if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
      failureRate: this.requestCount > 0 ? (this.failureCount / this.requestCount) * 100 : 0
    };
  }
}

// Database circuit breaker instance
const dbCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  monitoringPeriod: 60000,
  expectedErrors: ['connection terminated', 'timeout', 'ECONNRESET']
});

// Redis circuit breaker instance
const redisCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 15000,
  monitoringPeriod: 30000,
  expectedErrors: ['ECONNREFUSED', 'timeout']
});

// RabbitMQ circuit breaker instance
const rabbitmqCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 20000,
  monitoringPeriod: 45000,
  expectedErrors: ['ECONNREFUSED', 'timeout', 'channel closed']
});

/**
 * Middleware to wrap database operations with circuit breaker
 */
const withDatabaseCircuitBreaker = (operation, fallback = null) => {
  return dbCircuitBreaker.execute(operation, fallback);
};

/**
 * Middleware to wrap Redis operations with circuit breaker
 */
const withRedisCircuitBreaker = (operation, fallback = null) => {
  return redisCircuitBreaker.execute(operation, fallback);
};

/**
 * Middleware to wrap RabbitMQ operations with circuit breaker
 */
const withRabbitMQCircuitBreaker = (operation, fallback = null) => {
  return rabbitmqCircuitBreaker.execute(operation, fallback);
};

/**
 * Get circuit breaker statistics
 */
const getCircuitBreakerStats = () => {
  return {
    database: dbCircuitBreaker.getStats(),
    redis: redisCircuitBreaker.getStats(),
    rabbitmq: rabbitmqCircuitBreaker.getStats()
  };
};

/**
 * Health check for circuit breakers
 */
const checkCircuitBreakerHealth = () => {
  const stats = getCircuitBreakerStats();
  const unhealthy = [];

  Object.entries(stats).forEach(([service, stat]) => {
    if (stat.state === 'OPEN') {
      unhealthy.push(`${service} circuit breaker is OPEN`);
    } else if (stat.failureRate > 50) {
      unhealthy.push(`${service} has high failure rate: ${stat.failureRate.toFixed(2)}%`);
    }
  });

  return {
    healthy: unhealthy.length === 0,
    issues: unhealthy,
    stats
  };
};

module.exports = {
  CircuitBreaker,
  withDatabaseCircuitBreaker,
  withRedisCircuitBreaker,
  withRabbitMQCircuitBreaker,
  getCircuitBreakerStats,
  checkCircuitBreakerHealth
};
