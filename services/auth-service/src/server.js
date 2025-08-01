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
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const profileRoutes = require('./routes/profiles');
const addressRoutes = require('./routes/addresses');
const supplierRoutes = require('./routes/suppliers');
const healthRoutes = require('./routes/health');
const testRoutes = require('./routes/test');

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

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Temporarily disabled for testing
// app.use('/api/v1/auth/login', authLimiter);
// app.use('/api/v1/auth/register', authLimiter);

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/test', testRoutes);
app.use('/health', healthRoutes);
app.use('/api/v1/health', healthRoutes);

// Setup Swagger documentation
setupSwagger(app);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'GasConnect Authentication Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      healthApi: '/api/v1/health',
      docs: '/api/docs',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      profiles: '/api/v1/profiles',
      addresses: '/api/v1/addresses',
      suppliers: '/api/v1/suppliers'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} was not found.`,
    availableEndpoints: ['/health', '/api/docs', '/api/v1/auth', '/api/v1/users']
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
    
    const server = app.listen(config.port, () => {
      logger.info(`Auth Service running on port ${config.port}`);
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
