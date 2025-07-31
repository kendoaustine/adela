const express = require('express');
const { checkHealth: checkDatabaseHealth } = require('../database/connection');
const { checkHealth: checkRedisHealth } = require('../services/redis');
const { checkHealth: checkRabbitMQHealth } = require('../services/rabbitmq');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Basic health check endpoint - Ultra-lightweight for load balancers
 */
router.get('/', (req, res) => {
  // Ultra-fast health check with minimal processing
  res.status(200).json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime())
  });
});

/**
 * Simple health check with basic system info
 */
router.get('/health', (req, res) => {
  const healthCheck = {
    service: 'gasconnect-orders-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100,
    },
    cpu: process.cpuUsage(),
  };

  res.status(200).json(healthCheck);
});

/**
 * Detailed health check with dependencies
 */
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check all dependencies
    const [databaseHealth, redisHealth, rabbitmqHealth] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkRabbitMQHealth(),
    ]);

    const healthCheck = {
      service: 'gasconnect-auth-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      responseTime: `${Date.now() - startTime}ms`,
      dependencies: {
        database: databaseHealth.status === 'fulfilled' ? databaseHealth.value : {
          status: 'unhealthy',
          message: databaseHealth.reason?.message || 'Database check failed',
          timestamp: new Date().toISOString(),
        },
        redis: redisHealth.status === 'fulfilled' ? redisHealth.value : {
          status: 'unhealthy',
          message: redisHealth.reason?.message || 'Redis check failed',
          timestamp: new Date().toISOString(),
        },
        rabbitmq: rabbitmqHealth.status === 'fulfilled' ? rabbitmqHealth.value : {
          status: 'unhealthy',
          message: rabbitmqHealth.reason?.message || 'RabbitMQ check failed',
          timestamp: new Date().toISOString(),
        },
      },
      system: {
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
          external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100,
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
        },
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
      },
    };

    // Determine overall health status
    const unhealthyDependencies = Object.values(healthCheck.dependencies)
      .filter(dep => dep.status === 'unhealthy');

    if (unhealthyDependencies.length > 0) {
      healthCheck.status = 'degraded';
      healthCheck.issues = unhealthyDependencies.map(dep => dep.message);
    }

    // Return appropriate status code
    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthCheck);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    const healthCheck = {
      service: 'gasconnect-auth-service',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: `${Date.now() - startTime}ms`,
    };

    res.status(503).json(healthCheck);
  }
});

/**
 * Readiness probe - checks if service is ready to accept traffic
 */
router.get('/ready', async (req, res) => {
  try {
    // Check critical dependencies
    await checkDatabaseHealth();
    await checkRedisHealth();
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      message: 'Service is ready to accept traffic',
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      message: 'Service is not ready to accept traffic',
      error: error.message,
    });
  }
});

/**
 * Liveness probe - checks if service is alive
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Service is alive',
  });
});

module.exports = router;
