const crypto = require('crypto');

/**
 * Centralized Security Configuration
 * This file contains all security-related configurations and utilities
 */

class SecurityConfig {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.isDevelopment = this.environment === 'development';
    this.isProduction = this.environment === 'production';
    
    // Validate critical security environment variables
    this.validateSecurityEnvironment();
  }

  /**
   * JWT Configuration
   */
  get jwt() {
    return {
      secret: this.getRequiredEnv('JWT_SECRET'),
      refreshSecret: this.getRequiredEnv('JWT_REFRESH_SECRET'),
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: process.env.JWT_ISSUER || 'gasconnect-auth',
      audience: process.env.JWT_AUDIENCE || 'gasconnect-users',
      algorithm: 'HS256',
      clockTolerance: 30, // 30 seconds clock tolerance
      maxAge: '1h', // Maximum token age
      notBefore: 0, // Token valid immediately
    };
  }

  /**
   * Password Security Configuration
   */
  get password() {
    return {
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventCommonPasswords: true,
      preventUserInfoInPassword: true,
      maxPasswordAge: 90, // days
      passwordHistoryCount: 5, // Remember last 5 passwords
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
      // Password strength regex
      strengthRegex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
    };
  }

  /**
   * Rate Limiting Configuration
   */
  get rateLimit() {
    return {
      // Global rate limiting
      global: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
      },
      // Authentication endpoints
      auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5, // 5 login attempts per 15 minutes
        skipSuccessfulRequests: true,
        skipFailedRequests: false,
      },
      // Registration endpoints
      register: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3, // 3 registration attempts per hour
        skipSuccessfulRequests: true,
      },
      // Password reset endpoints
      passwordReset: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3, // 3 password reset attempts per hour
      },
      // API endpoints
      api: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 requests per minute
      },
    };
  }

  /**
   * Session Security Configuration
   */
  get session() {
    return {
      secret: this.getRequiredEnv('SESSION_SECRET'),
      name: 'gasconnect.sid',
      resave: false,
      saveUninitialized: false,
      rolling: true, // Reset expiration on activity
      cookie: {
        secure: this.isProduction, // HTTPS only in production
        httpOnly: true, // Prevent XSS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict', // CSRF protection
      },
      genid: () => crypto.randomBytes(32).toString('hex'),
    };
  }

  /**
   * CORS Configuration
   */
  get cors() {
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
      : ['http://localhost:3000'];

    return {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Request-ID',
        'X-Forwarded-For',
      ],
      exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
      maxAge: 86400, // 24 hours
    };
  }

  /**
   * Security Headers Configuration
   */
  get securityHeaders() {
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          childSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: {
        geolocation: [],
        microphone: [],
        camera: [],
        payment: [],
        usb: [],
        magnetometer: [],
        gyroscope: [],
        speaker: [],
        vibrate: [],
        fullscreen: ['self'],
        'sync-xhr': [],
      },
    };
  }

  /**
   * Encryption Configuration
   */
  get encryption() {
    return {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      tagLength: 16,
      key: this.getEncryptionKey(),
    };
  }

  /**
   * Account Security Configuration
   */
  get account() {
    return {
      maxLoginAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes
      passwordResetExpiry: 60 * 60 * 1000, // 1 hour
      emailVerificationExpiry: 24 * 60 * 60 * 1000, // 24 hours
      otpLength: 6,
      otpExpiry: 10 * 60 * 1000, // 10 minutes
      maxOtpAttempts: 3,
      sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      inactivityTimeout: 2 * 60 * 60 * 1000, // 2 hours
      enable2FA: process.env.ENABLE_2FA === 'true',
    };
  }

  /**
   * Audit and Logging Configuration
   */
  get audit() {
    return {
      enabled: process.env.ENABLE_AUDIT_LOGGING !== 'false',
      logLevel: process.env.LOG_LEVEL || 'info',
      logFormat: process.env.LOG_FORMAT || 'json',
      retentionDays: 90,
      sensitiveFields: [
        'password',
        'token',
        'secret',
        'key',
        'authorization',
        'cookie',
        'session',
      ],
      auditEvents: [
        'user.login',
        'user.logout',
        'user.register',
        'user.password.change',
        'user.email.change',
        'user.delete',
        'admin.action',
        'payment.process',
        'order.create',
        'order.cancel',
        'security.violation',
      ],
    };
  }

  /**
   * API Security Configuration
   */
  get api() {
    return {
      keySecret: this.getRequiredEnv('API_KEY_SECRET'),
      keyLength: 32,
      keyExpiry: 365 * 24 * 60 * 60 * 1000, // 1 year
      requestTimeout: 30000, // 30 seconds
      maxRequestSize: '10mb',
      trustedProxies: process.env.TRUSTED_PROXIES 
        ? process.env.TRUSTED_PROXIES.split(',').map(ip => ip.trim())
        : ['127.0.0.1', '::1'],
    };
  }

  /**
   * Get required environment variable
   */
  getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  /**
   * Get encryption key
   */
  getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    // Ensure key is 32 bytes for AES-256
    return crypto.scryptSync(key, 'gasconnect-salt', 32);
  }

  /**
   * Validate security environment variables
   */
  validateSecurityEnvironment() {
    const requiredVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'API_KEY_SECRET',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      const message = `Missing required security environment variables: ${missingVars.join(', ')}`;
      
      if (this.isProduction) {
        throw new Error(message);
      } else {
        console.warn(`⚠️  ${message}`);
      }
    }

    // Validate JWT secret strength
    this.validateSecretStrength('JWT_SECRET', process.env.JWT_SECRET);
    this.validateSecretStrength('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
  }

  /**
   * Validate secret strength
   */
  validateSecretStrength(name, secret) {
    if (!secret) return;

    if (secret.length < 32) {
      const message = `${name} should be at least 32 characters long`;
      if (this.isProduction) {
        throw new Error(message);
      } else {
        console.warn(`⚠️  ${message}`);
      }
    }

    // Check for common weak secrets
    const weakSecrets = [
      'your-super-secret',
      'change-in-production',
      'secret',
      'password',
      '123456',
    ];

    const isWeak = weakSecrets.some(weak => secret.toLowerCase().includes(weak.toLowerCase()));
    if (isWeak) {
      const message = `${name} appears to be a weak or default secret`;
      if (this.isProduction) {
        throw new Error(message);
      } else {
        console.warn(`⚠️  ${message}`);
      }
    }
  }

  /**
   * Generate secure random string
   */
  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate API key
   */
  generateApiKey() {
    const timestamp = Date.now().toString(36);
    const random = this.generateSecureRandom(16);
    return `gc_${timestamp}_${random}`;
  }
}

// Export singleton instance
module.exports = new SecurityConfig();
