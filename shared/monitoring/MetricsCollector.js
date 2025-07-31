const client = require('prom-client');
const logger = require('../utils/logger');

/**
 * Centralized Metrics Collector for GasConnect
 * Provides consistent metrics collection across all services
 */
class MetricsCollector {
  constructor(serviceName, config = {}) {
    this.serviceName = serviceName;
    this.config = {
      prefix: config.prefix || 'gasconnect_',
      defaultLabels: {
        service: serviceName,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        ...config.defaultLabels
      },
      collectDefaultMetrics: config.collectDefaultMetrics !== false,
      ...config
    };

    // Set default labels
    client.register.setDefaultLabels(this.config.defaultLabels);

    // Collect default metrics (CPU, memory, etc.)
    if (this.config.collectDefaultMetrics) {
      client.collectDefaultMetrics({
        prefix: this.config.prefix,
        timeout: 5000,
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      });
    }

    this.initializeMetrics();
  }

  /**
   * Initialize service-specific metrics
   */
  initializeMetrics() {
    // HTTP request metrics
    this.httpRequestsTotal = new client.Counter({
      name: `${this.config.prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'service']
    });

    this.httpRequestDuration = new client.Histogram({
      name: `${this.config.prefix}http_request_duration_seconds`,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'service'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    });

    // Database metrics
    this.dbConnectionsActive = new client.Gauge({
      name: `${this.config.prefix}db_connections_active`,
      help: 'Number of active database connections',
      labelNames: ['database', 'service']
    });

    this.dbQueryDuration = new client.Histogram({
      name: `${this.config.prefix}db_query_duration_seconds`,
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table', 'service'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    });

    this.dbQueriesTotal = new client.Counter({
      name: `${this.config.prefix}db_queries_total`,
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'status', 'service']
    });

    // Cache metrics
    this.cacheOperationsTotal = new client.Counter({
      name: `${this.config.prefix}cache_operations_total`,
      help: 'Total number of cache operations',
      labelNames: ['operation', 'result', 'service']
    });

    this.cacheHitRatio = new client.Gauge({
      name: `${this.config.prefix}cache_hit_ratio`,
      help: 'Cache hit ratio',
      labelNames: ['cache_type', 'service']
    });

    // Queue metrics
    this.queueSize = new client.Gauge({
      name: `${this.config.prefix}queue_size`,
      help: 'Number of items in queue',
      labelNames: ['queue_name', 'service']
    });

    this.queueProcessingDuration = new client.Histogram({
      name: `${this.config.prefix}queue_processing_duration_seconds`,
      help: 'Duration of queue item processing in seconds',
      labelNames: ['queue_name', 'status', 'service'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    });

    // Business metrics (service-specific)
    this.businessEventsTotal = new client.Counter({
      name: `${this.config.prefix}business_events_total`,
      help: 'Total number of business events',
      labelNames: ['event_type', 'status', 'service']
    });

    this.activeUsers = new client.Gauge({
      name: `${this.config.prefix}active_users`,
      help: 'Number of active users',
      labelNames: ['user_type', 'service']
    });

    // Error metrics
    this.errorsTotal = new client.Counter({
      name: `${this.config.prefix}errors_total`,
      help: 'Total number of errors',
      labelNames: ['error_type', 'severity', 'service']
    });

    // Custom metrics storage
    this.customMetrics = new Map();
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method, route, statusCode, duration) {
    const labels = {
      method: method.toLowerCase(),
      route,
      status_code: statusCode.toString(),
      service: this.serviceName
    };

    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, duration);
  }

  /**
   * Record database query metrics
   */
  recordDbQuery(operation, table, duration, status = 'success') {
    const labels = {
      operation: operation.toLowerCase(),
      table,
      service: this.serviceName
    };

    this.dbQueriesTotal.inc({ ...labels, status });
    this.dbQueryDuration.observe(labels, duration);
  }

  /**
   * Update database connection count
   */
  updateDbConnections(count, database = 'postgresql') {
    this.dbConnectionsActive.set({ database, service: this.serviceName }, count);
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(operation, result) {
    this.cacheOperationsTotal.inc({
      operation: operation.toLowerCase(),
      result: result.toLowerCase(),
      service: this.serviceName
    });
  }

  /**
   * Update cache hit ratio
   */
  updateCacheHitRatio(ratio, cacheType = 'redis') {
    this.cacheHitRatio.set({ cache_type: cacheType, service: this.serviceName }, ratio);
  }

  /**
   * Update queue size
   */
  updateQueueSize(queueName, size) {
    this.queueSize.set({ queue_name: queueName, service: this.serviceName }, size);
  }

  /**
   * Record queue processing time
   */
  recordQueueProcessing(queueName, duration, status = 'success') {
    this.queueProcessingDuration.observe({
      queue_name: queueName,
      status,
      service: this.serviceName
    }, duration);
  }

  /**
   * Record business event
   */
  recordBusinessEvent(eventType, status = 'success') {
    this.businessEventsTotal.inc({
      event_type: eventType,
      status,
      service: this.serviceName
    });
  }

  /**
   * Update active users count
   */
  updateActiveUsers(count, userType = 'all') {
    this.activeUsers.set({ user_type: userType, service: this.serviceName }, count);
  }

  /**
   * Record error
   */
  recordError(errorType, severity = 'error') {
    this.errorsTotal.inc({
      error_type: errorType,
      severity,
      service: this.serviceName
    });
  }

  /**
   * Create custom counter
   */
  createCounter(name, help, labelNames = []) {
    const fullName = `${this.config.prefix}${name}`;
    const counter = new client.Counter({
      name: fullName,
      help,
      labelNames: [...labelNames, 'service']
    });
    
    this.customMetrics.set(name, counter);
    return counter;
  }

  /**
   * Create custom gauge
   */
  createGauge(name, help, labelNames = []) {
    const fullName = `${this.config.prefix}${name}`;
    const gauge = new client.Gauge({
      name: fullName,
      help,
      labelNames: [...labelNames, 'service']
    });
    
    this.customMetrics.set(name, gauge);
    return gauge;
  }

  /**
   * Create custom histogram
   */
  createHistogram(name, help, labelNames = [], buckets = undefined) {
    const fullName = `${this.config.prefix}${name}`;
    const histogram = new client.Histogram({
      name: fullName,
      help,
      labelNames: [...labelNames, 'service'],
      buckets
    });
    
    this.customMetrics.set(name, histogram);
    return histogram;
  }

  /**
   * Get custom metric
   */
  getCustomMetric(name) {
    return this.customMetrics.get(name);
  }

  /**
   * Create middleware for Express.js
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        
        this.recordHttpRequest(
          req.method,
          route,
          res.statusCode,
          duration
        );
      });
      
      next();
    };
  }

  /**
   * Create database query wrapper
   */
  wrapDbQuery(queryFunction, operation, table) {
    return async (...args) => {
      const start = Date.now();
      let status = 'success';
      
      try {
        const result = await queryFunction(...args);
        return result;
      } catch (error) {
        status = 'error';
        this.recordError('database_query_error');
        throw error;
      } finally {
        const duration = (Date.now() - start) / 1000;
        this.recordDbQuery(operation, table, duration, status);
      }
    };
  }

  /**
   * Create cache operation wrapper
   */
  wrapCacheOperation(cacheFunction, operation) {
    return async (...args) => {
      let result = 'miss';
      
      try {
        const cacheResult = await cacheFunction(...args);
        result = cacheResult ? 'hit' : 'miss';
        return cacheResult;
      } catch (error) {
        result = 'error';
        this.recordError('cache_operation_error');
        throw error;
      } finally {
        this.recordCacheOperation(operation, result);
      }
    };
  }

  /**
   * Get metrics for Prometheus scraping
   */
  async getMetrics() {
    try {
      return await client.register.metrics();
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      throw error;
    }
  }

  /**
   * Get metrics in JSON format
   */
  async getMetricsJSON() {
    try {
      const metrics = await client.register.getMetricsAsJSON();
      return metrics;
    } catch (error) {
      logger.error('Failed to get metrics as JSON:', error);
      throw error;
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    client.register.clear();
    this.customMetrics.clear();
    this.initializeMetrics();
  }

  /**
   * Health check for metrics system
   */
  healthCheck() {
    try {
      const metricNames = client.register.getMetricsAsArray().map(m => m.name);
      return {
        status: 'healthy',
        metricsCount: metricNames.length,
        customMetricsCount: this.customMetrics.size,
        serviceName: this.serviceName
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        serviceName: this.serviceName
      };
    }
  }

  /**
   * Start collecting periodic metrics
   */
  startPeriodicCollection(interval = 30000) {
    this.periodicInterval = setInterval(() => {
      try {
        // Collect memory usage
        const memUsage = process.memoryUsage();
        this.createGauge('process_memory_usage_bytes', 'Process memory usage in bytes', ['type'])
          .set({ type: 'rss', service: this.serviceName }, memUsage.rss);
        this.createGauge('process_memory_usage_bytes', 'Process memory usage in bytes', ['type'])
          .set({ type: 'heapUsed', service: this.serviceName }, memUsage.heapUsed);
        this.createGauge('process_memory_usage_bytes', 'Process memory usage in bytes', ['type'])
          .set({ type: 'heapTotal', service: this.serviceName }, memUsage.heapTotal);

        // Collect event loop lag
        const start = process.hrtime.bigint();
        setImmediate(() => {
          const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
          this.createGauge('nodejs_eventloop_lag_milliseconds', 'Event loop lag in milliseconds')
            .set({ service: this.serviceName }, lag);
        });

      } catch (error) {
        logger.error('Error in periodic metrics collection:', error);
      }
    }, interval);
  }

  /**
   * Stop periodic collection
   */
  stopPeriodicCollection() {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
    }
  }
}

module.exports = MetricsCollector;
