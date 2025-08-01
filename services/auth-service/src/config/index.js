require('dotenv').config();

const config = {
  // Server configuration
  port: parseInt(process.env.PORT, 10) || 3001,
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
    keyPrefix: 'gasconnect:auth:',
    ttl: {
      session: 24 * 60 * 60, // 24 hours
      otp: 10 * 60, // 10 minutes
      rateLimit: 60 * 60, // 1 hour
      passwordReset: 30 * 60, // 30 minutes
    },
  },
  
  // RabbitMQ configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://gasconnect:gasconnect_password@localhost:5672',
    exchanges: {
      auth: 'auth.events',
      orders: 'orders.events',
      supplier: 'supplier.events',
    },
    queues: {
      userCreated: 'auth.user.created',
      userUpdated: 'auth.user.updated',
      userVerified: 'auth.user.verified',
      supplierVerified: 'auth.supplier.verified',
    },
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'gasconnect-auth',
    audience: process.env.JWT_AUDIENCE || 'gasconnect-users',
    algorithm: 'HS256',
    clockTolerance: 30,
  },
  
  // Password hashing configuration
  password: {
    argon2: {
      type: 2, // argon2id
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
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
  
  // File upload configuration
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || '10MB',
    allowedTypes: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
    uploadPath: process.env.UPLOAD_PATH || './uploads',
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
    templates: {
      welcome: 'welcome',
      emailVerification: 'email-verification',
      passwordReset: 'password-reset',
      supplierApproval: 'supplier-approval',
    },
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
  
  // Security configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 minutes
    otpLength: 6,
    otpExpiry: 10 * 60 * 1000, // 10 minutes
    sessionSecret: process.env.SESSION_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    enable2FA: process.env.ENABLE_2FA === 'true',
    enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  // Service URLs
  services: {
    orders: process.env.ORDERS_SERVICE_URL || 'http://localhost:3002',
    supplier: process.env.SUPPLIER_SERVICE_URL || 'http://localhost:3003',
  },
  
  // Validation rules
  validation: {
    password: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    },
    phone: {
      pattern: /^\+[1-9]\d{1,14}$/, // E.164 format
    },
    email: {
      maxLength: 255,
    },
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 Cannot start in production without required environment variables');
    process.exit(1);
  } else {
    console.warn('⚠️  Using default values for missing environment variables in development');
  }
}

// Validate JWT secret strength
const validateSecretStrength = (name, secret) => {
  if (!secret) return;

  if (secret.length < 32) {
    const message = `${name} should be at least 32 characters long`;
    if (process.env.NODE_ENV === 'production') {
      console.error(`🚨 ${message}`);
      process.exit(1);
    } else {
      console.warn(`⚠️  ${message}`);
    }
  }

  const weakPatterns = ['your-super-secret', 'change-in-production', 'secret', 'password'];
  const isWeak = weakPatterns.some(pattern => secret.toLowerCase().includes(pattern));

  if (isWeak) {
    const message = `${name} appears to be a weak or default secret`;
    if (process.env.NODE_ENV === 'production') {
      console.error(`🚨 ${message}`);
      process.exit(1);
    } else {
      console.warn(`⚠️  ${message}`);
    }
  }
};

validateSecretStrength('JWT_SECRET', process.env.JWT_SECRET);
validateSecretStrength('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
validateSecretStrength('SESSION_SECRET', process.env.SESSION_SECRET);

module.exports = config;
