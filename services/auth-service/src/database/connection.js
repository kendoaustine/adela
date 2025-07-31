const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');
const { withDatabaseCircuitBreaker } = require('../middleware/circuitBreaker');

let pool = null;

/**
 * Create and configure PostgreSQL connection pool
 */
const createPool = () => {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: config.database.url,
    min: config.database.pool.min,
    max: config.database.pool.max,
    acquireTimeoutMillis: config.database.pool.acquireTimeoutMillis,
    idleTimeoutMillis: config.database.pool.idleTimeoutMillis,
    createTimeoutMillis: config.database.pool.createTimeoutMillis,
    reapIntervalMillis: config.database.pool.reapIntervalMillis,
    createRetryIntervalMillis: config.database.pool.createRetryIntervalMillis,
    ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    // Additional performance optimizations
    statement_timeout: 30000,  // 30 second query timeout
    query_timeout: 30000,      // 30 second query timeout
    application_name: 'gasconnect-auth-service',
  });

  // Handle pool events
  pool.on('connect', (client) => {
    logger.debug('New database client connected');
  });

  pool.on('acquire', (client) => {
    logger.debug('Database client acquired from pool');
  });

  pool.on('remove', (client) => {
    logger.debug('Database client removed from pool');
  });

  pool.on('error', (err, client) => {
    logger.error('Database pool error:', err);
  });

  return pool;
};

/**
 * Connect to the database and test the connection
 */
const connectDatabase = async () => {
  try {
    const dbPool = createPool();
    
    // Test the connection
    const client = await dbPool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    client.release();
    
    logger.info('Database connected successfully', {
      currentTime: result.rows[0].current_time,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
    });
    
    return dbPool;
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
};

/**
 * Get the database pool instance
 */
const getPool = () => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call connectDatabase() first.');
  }
  return pool;
};

/**
 * Execute a query with automatic connection handling and circuit breaker
 */
const query = async (text, params = []) => {
  return withDatabaseCircuitBreaker(async () => {
    const dbPool = getPool();
    const start = Date.now();

    try {
      const result = await dbPool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;

      logger.error('Database query failed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration: `${duration}ms`,
        error: error.message,
        params: params,
      });

      throw error;
    }
  }, async () => {
    // Fallback: return cached result or throw service unavailable error
    logger.warn('Database circuit breaker is open, query failed', { query: text.substring(0, 50) });
    throw new Error('Database service temporarily unavailable');
  });
};

/**
 * Execute a transaction with automatic rollback on error
 */
const transaction = async (callback) => {
  const dbPool = getPool();
  const client = await dbPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create a query function bound to this client
    const transactionQuery = async (text, params = []) => {
      const start = Date.now();
      
      try {
        const result = await client.query(text, params);
        const duration = Date.now() - start;
        
        logger.debug('Transaction query executed', {
          query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          duration: `${duration}ms`,
          rows: result.rowCount,
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        
        logger.error('Transaction query failed', {
          query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          duration: `${duration}ms`,
          error: error.message,
          params: params,
        });
        
        throw error;
      }
    };
    
    // Execute the callback with the transaction query function
    const result = await callback(transactionQuery);
    
    await client.query('COMMIT');
    logger.debug('Transaction committed successfully');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back due to error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Close the database connection pool
 */
const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
};

/**
 * Check database health
 */
const checkHealth = async () => {
  try {
    const result = await query('SELECT 1 as health_check');
    return {
      status: 'healthy',
      message: 'Database connection is working',
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
  connectDatabase,
  getPool,
  query,
  transaction,
  closeDatabase,
  checkHealth,
};
