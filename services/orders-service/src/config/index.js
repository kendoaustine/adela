require('dotenv').config();

const config = {
  // Server configuration
  port: parseInt(process.env.PORT, 10) || 3002,
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
    keyPrefix: 'gasconnect:orders:',
    ttl: {
      activeOrders: 24 * 60 * 60, // 24 hours
      deliveryStatus: 6 * 60 * 60, // 6 hours
      driverLocation: 5 * 60, // 5 minutes
      orderCache: 60 * 60, // 1 hour
    },
  },
  
  // RabbitMQ configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://gasconnect:gasconnect_password@localhost:5672',
    exchanges: {
      orders: 'orders.events',
      auth: 'auth.events',
      supplier: 'supplier.events',
    },
    queues: {
      orderCreated: 'orders.order.created',
      orderUpdated: 'orders.order.updated',
      orderCancelled: 'orders.order.cancelled',
      deliveryStatusChanged: 'orders.delivery.status.changed',
      inventoryUpdated: 'orders.inventory.updated',
    },
  },
  
  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  },
  
  // Service URLs
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    supplier: process.env.SUPPLIER_SERVICE_URL || 'http://localhost:3003',
  },
  
  // Order configuration
  orders: {
    emergencyPriorityMultiplier: 1.5, // 50% surcharge for emergency orders
    maxOrderItems: 50,
    maxRecurringOrders: 10,
    defaultDeliveryRadius: 50, // km
    orderNumberPrefix: 'GC',
    orderNumberLength: 10,
  },
  
  // Delivery configuration
  delivery: {
    maxDeliveryDistance: 100, // km
    estimatedDeliveryTime: {
      normal: 2 * 60 * 60 * 1000, // 2 hours
      emergency: 30 * 60 * 1000, // 30 minutes
    },
    driverLocationUpdateInterval: 30 * 1000, // 30 seconds
    deliveryTimeoutHours: 24,
  },
  
  // Cylinder tracking configuration
  cylinders: {
    inspectionIntervalMonths: 12,
    expiryWarningDays: 30,
    qrCodePrefix: 'GC-CYL-',
    rfidPrefix: 'GC-RFID-',
  },
  
  // Notification configuration
  notifications: {
    orderStatusUpdates: true,
    deliveryTracking: true,
    emergencyAlerts: true,
    recurringOrderReminders: true,
  },
  
  // WebSocket configuration
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    maxConnections: 1000,
    rooms: {
      orderUpdates: 'order_updates',
      deliveryTracking: 'delivery_tracking',
      emergencyAlerts: 'emergency_alerts',
    },
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  // Cron job schedules
  cron: {
    recurringOrders: '0 9 * * *', // Daily at 9 AM
    deliveryTimeouts: '*/15 * * * *', // Every 15 minutes
    cylinderInspections: '0 0 * * 0', // Weekly on Sunday
    orderCleanup: '0 2 * * *', // Daily at 2 AM
  },
  
  // Emergency SOS configuration
  emergency: {
    maxResponseTime: 30 * 60 * 1000, // 30 minutes
    priorityBoost: 10, // Priority score boost
    autoAssignRadius: 20, // km
    escalationTimeouts: [5, 10, 15], // minutes
  },
  
  // Recurring orders configuration
  recurring: {
    maxFrequency: 'daily',
    minFrequency: 'monthly',
    advanceOrderDays: 1, // Create order 1 day in advance
    maxSkippedOrders: 3,
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
