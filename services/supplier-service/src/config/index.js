require('dotenv').config();

const config = {
  // Server configuration
  port: parseInt(process.env.PORT, 10) || 3003,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration - Optimized for performance
  database: {
    url: process.env.DATABASE_URL || 'postgresql://gasconnect:gasconnect_password@localhost:5432/gasconnect',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 5,        // Increased from 2 to maintain ready connections
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,       // Increased from 10 to handle concurrent requests
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT, 10) || 30000,  // Reduced from 60000 for faster failure detection
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 10000,        // Reduced from 30000 to free idle connections faster
      createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT, 10) || 30000,    // New: timeout for creating connections
      reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL, 10) || 1000,       // New: how often to check for idle connections
      createRetryIntervalMillis: parseInt(process.env.DB_RETRY_INTERVAL, 10) || 200, // New: retry interval for failed connections
    },
  },
  
  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || '',
    keyPrefix: 'gasconnect:supplier:',
    ttl: {
      inventory: 60 * 60, // 1 hour
      pricing: 4 * 60 * 60, // 4 hours
      payments: 30 * 60, // 30 minutes
      analytics: 24 * 60 * 60, // 24 hours
    },
  },
  
  // RabbitMQ configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://gasconnect:gasconnect_password@localhost:5672',
    exchanges: {
      supplier: 'supplier.events',
      orders: 'orders.events',
      auth: 'auth.events',
    },
    queues: {
      inventoryUpdated: 'supplier.inventory.updated',
      pricingUpdated: 'supplier.pricing.updated',
      paymentProcessed: 'supplier.payment.processed',
      orderReceived: 'supplier.order.received',
    },
  },
  
  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: process.env.JWT_ISSUER || 'gasconnect-auth',
    audience: process.env.JWT_AUDIENCE || 'gasconnect-users',
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  },
  
  // Service URLs
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    orders: process.env.ORDERS_SERVICE_URL || 'http://localhost:3002',
  },
  
  // Payment configuration
  payments: {
    paystack: {
      secretKey: process.env.PAYSTACK_SECRET_KEY,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY,
      webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
    },
    currency: process.env.PAYMENT_CURRENCY || 'NGN',
    escrowDays: 7, // Days to hold payment in escrow
    platformFeePercentage: 2.5, // Platform fee percentage
  },
  
  // Inventory configuration
  inventory: {
    lowStockThreshold: 10,
    autoReorderEnabled: true,
    maxStockLevel: 1000,
    reservationTimeoutMinutes: 30,
  },
  
  // Pricing configuration
  pricing: {
    maxDiscountPercentage: 50,
    bulkDiscountThreshold: 10,
    emergencySurchargeMax: 100, // Maximum emergency surcharge percentage
    priceValidityDays: 30,
  },
  
  // Analytics configuration
  analytics: {
    retentionDays: 365,
    reportingIntervals: ['daily', 'weekly', 'monthly', 'yearly'],
    metricsRefreshMinutes: 15,
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // Email configuration
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    from: process.env.FROM_EMAIL || 'noreply@gasconnect.com',
  },

  // SMS configuration
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
  },

  // App configuration
  app: {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
  
  // Cron job schedules
  cron: {
    inventoryCheck: '*/30 * * * *', // Every 30 minutes
    pricingUpdate: '0 */6 * * *', // Every 6 hours
    paymentProcessing: '*/5 * * * *', // Every 5 minutes
    analyticsRefresh: '0 * * * *', // Every hour
    walletReconciliation: '0 2 * * *', // Daily at 2 AM
  },
  
  // Promotional bundles configuration
  bundles: {
    maxItemsPerBundle: 10,
    maxActivePerSupplier: 20,
    defaultValidityDays: 30,
    maxDiscountPercentage: 40,
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

module.exports = config;
