const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('express-async-errors');

const config = require('./config');
const logger = require('./utils/logger');
const { connectDatabase } = require('./database/connection');
const { connectRedis } = require('./services/redis');
const { connectRabbitMQ } = require('./services/rabbitmq');
const { errorHandler } = require('./middleware/errorHandler');
const { setupSwagger } = require('./utils/swagger');

// Import routes
const inventoryRoutes = require('./routes/inventory');
const pricingRoutes = require('./routes/pricing');
const paymentsRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');
const bundlesRoutes = require('./routes/bundles');
const healthRoutes = require('./routes/health');

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// API routes
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/pricing', pricingRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/bundles', bundlesRoutes);
app.use('/health', healthRoutes);
app.use('/api/v1/health', healthRoutes);

// Setup Swagger documentation
setupSwagger(app);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'GasConnect Supplier & Inventory Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      healthApi: '/api/v1/health',
      docs: '/api/docs',
      inventory: '/api/v1/inventory',
      pricing: '/api/v1/pricing',
      payments: '/api/v1/payments',
      analytics: '/api/v1/analytics',
      bundles: '/api/v1/bundles'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} was not found.`,
    availableEndpoints: ['/health', '/api/docs', '/api/v1/inventory', '/api/v1/pricing']
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Close server
  server.close(() => {
    logger.info('HTTP server closed.');
  });
  
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Initialize connections
    await connectDatabase();
    await connectRedis();
    await connectRabbitMQ();
    
    const server = app.listen(config.port, () => {
      logger.info(`Supplier Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API Documentation: http://localhost:${config.port}/api/docs`);
    });
    
    // Store server reference for graceful shutdown
    global.server = server;
    
    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
