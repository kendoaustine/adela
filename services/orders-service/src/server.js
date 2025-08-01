const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('express-async-errors');

const config = require('./config');
const logger = require('./utils/logger');
const { connectDatabase } = require('./database/connection');
const { connectRedis } = require('./services/redis');
const { connectRabbitMQ } = require('./services/rabbitmq');
const { errorHandler } = require('./middleware/errorHandler');
const { setupSwagger } = require('./utils/swagger');
const { setupWebSocket } = require('./services/websocket');

// Import routes
const orderRoutes = require('./routes/orders');
const deliveryRoutes = require('./routes/delivery');
const cylinderRoutes = require('./routes/cylinders');
const trackingRoutes = require('./routes/tracking');
const healthRoutes = require('./routes/health');

const app = express();
const server = createServer(app);

// Setup WebSocket for real-time updates
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Store io instance globally for use in other modules
global.io = io;

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
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/delivery', deliveryRoutes);
app.use('/api/v1/cylinders', cylinderRoutes);
app.use('/api/v1/tracking', trackingRoutes);
app.use('/health', healthRoutes);

// Setup Swagger documentation
setupSwagger(app);

// Setup WebSocket handlers
setupWebSocket(io);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'GasConnect Orders & Delivery Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      docs: '/api/docs',
      orders: '/api/v1/orders',
      delivery: '/api/v1/delivery',
      cylinders: '/api/v1/cylinders',
      tracking: '/api/v1/tracking'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} was not found.`,
    availableEndpoints: ['/health', '/api/docs', '/api/v1/orders', '/api/v1/delivery']
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
  
  // Close WebSocket server
  io.close(() => {
    logger.info('WebSocket server closed.');
  });
  
  // Close database connections, Redis, RabbitMQ, etc.
  // These will be implemented in their respective modules
  
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
    
    server.listen(config.port, () => {
      logger.info(`Orders Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`API Documentation: http://localhost:${config.port}/api/docs`);
      logger.info(`WebSocket server ready for real-time updates`);
    });
    
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
