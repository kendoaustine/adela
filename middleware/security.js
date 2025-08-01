const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const securityConfig = require('../config/security');
const logger = require('../utils/logger');

/**
 * Enhanced Security Middleware Collection
 */

/**
 * Request ID middleware for tracing
 */
const requestId = (req, res, next) => {
  req.requestId = securityConfig.generateSecureRandom(16);
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: securityConfig.securityHeaders.contentSecurityPolicy,
  hsts: securityConfig.securityHeaders.hsts,
  noSniff: securityConfig.securityHeaders.noSniff,
  frameguard: securityConfig.securityHeaders.frameguard,
  xssFilter: securityConfig.securityHeaders.xssFilter,
  referrerPolicy: securityConfig.securityHeaders.referrerPolicy,
  permissionsPolicy: securityConfig.securityHeaders.permissionsPolicy,
});

/**
 * CORS middleware
 */
const corsMiddleware = cors(securityConfig.cors);

/**
 * Compression middleware with security considerations
 */
const compressionMiddleware = compression({
  filter: (req, res) => {
    // Don't compress responses with sensitive data
    if (req.headers['x-no-compression']) {
      return false;
    }
    
    // Don't compress small responses
    const contentLength = res.getHeader('content-length');
    if (contentLength && contentLength < 1024) {
      return false;
    }
    
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
});

/**
 * Rate limiting middleware factory
 */
const createRateLimit = (type = 'global') => {
  const config = securityConfig.rateLimit[type] || securityConfig.rateLimit.global;
  
  return rateLimit({
    windowMs: config.windowMs,
    max: config.maxRequests,
    message: {
      error: 'Too Many Requests',
      message: config.message || 'Too many requests from this IP, please try again later',
      retryAfter: Math.ceil(config.windowMs / 1000),
    },
    standardHeaders: config.standardHeaders !== false,
    legacyHeaders: config.legacyHeaders === true,
    skipSuccessfulRequests: config.skipSuccessfulRequests === true,
    skipFailedRequests: config.skipFailedRequests === true,
    keyGenerator: (req) => {
      // Use forwarded IP if behind proxy
      return req.ip || req.connection.remoteAddress;
    },
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        requestId: req.requestId,
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: config.message || 'Too many requests from this IP, please try again later',
        retryAfter: Math.ceil(config.windowMs / 1000),
      });
    },
  });
};

/**
 * Slow down middleware for progressive delays
 */
const createSlowDown = (type = 'global') => {
  const config = securityConfig.rateLimit[type] || securityConfig.rateLimit.global;
  
  return slowDown({
    windowMs: config.windowMs,
    delayAfter: Math.floor(config.maxRequests * 0.5), // Start slowing down at 50% of limit
    delayMs: 500, // Add 500ms delay per request
    maxDelayMs: 5000, // Maximum delay of 5 seconds
    skipFailedRequests: true,
    skipSuccessfulRequests: false,
  });
};

/**
 * IP whitelist middleware
 */
const ipWhitelist = (req, res, next) => {
  if (process.env.ENABLE_IP_WHITELIST !== 'true') {
    return next();
  }
  
  const whitelist = process.env.IP_WHITELIST 
    ? process.env.IP_WHITELIST.split(',').map(ip => ip.trim())
    : [];
  
  if (whitelist.length === 0) {
    return next();
  }
  
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (!whitelist.includes(clientIP)) {
    logger.warn('IP not whitelisted', {
      ip: clientIP,
      userAgent: req.get('User-Agent'),
      path: req.path,
      requestId: req.requestId,
    });
    
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied from this IP address',
    });
  }
  
  next();
};

/**
 * Request size limiter
 */
const requestSizeLimit = (req, res, next) => {
  const maxSize = securityConfig.api.maxRequestSize;
  const contentLength = req.get('content-length');
  
  if (contentLength && parseInt(contentLength, 10) > parseInt(maxSize)) {
    logger.warn('Request size limit exceeded', {
      contentLength,
      maxSize,
      ip: req.ip,
      path: req.path,
      requestId: req.requestId,
    });
    
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `Request size exceeds limit of ${maxSize}`,
    });
  }
  
  next();
};

/**
 * Security audit middleware
 */
const securityAudit = (req, res, next) => {
  if (!securityConfig.audit.enabled) {
    return next();
  }
  
  // Log security-relevant requests
  const securityPaths = ['/auth/', '/admin/', '/api/'];
  const isSecurityPath = securityPaths.some(path => req.path.includes(path));
  
  if (isSecurityPath) {
    logger.info('Security audit', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }
  
  next();
};

/**
 * Suspicious activity detector
 */
const suspiciousActivityDetector = (req, res, next) => {
  const suspiciousPatterns = [
    /\b(union|select|insert|delete|drop|create|alter)\b/i, // SQL injection
    /<script|javascript:|vbscript:|onload|onerror/i, // XSS
    /\.\.\//g, // Path traversal
    /(cmd|exec|system|eval|expression)/i, // Command injection
  ];
  
  const checkString = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(checkString));
  
  if (isSuspicious) {
    logger.warn('Suspicious activity detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      query: req.query,
      requestId: req.requestId,
    });
    
    // Don't block in development, just log
    if (process.env.NODE_ENV === 'production') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request contains suspicious content',
      });
    }
  }
  
  next();
};

/**
 * Request timeout middleware
 */
const requestTimeout = (timeout = securityConfig.api.requestTimeout) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          timeout,
          requestId: req.requestId,
        });
        
        res.status(408).json({
          error: 'Request Timeout',
          message: 'Request took too long to process',
        });
      }
    }, timeout);
    
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    
    next();
  };
};

/**
 * Content type validation
 */
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }
    
    const contentType = req.get('content-type');
    if (!contentType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Content-Type header is required',
      });
    }
    
    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    if (!isAllowed) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
      });
    }
    
    next();
  };
};

/**
 * API key validation middleware
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required',
    });
  }
  
  // Validate API key format
  if (!apiKey.startsWith('gc_') || apiKey.length < 32) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key format',
    });
  }
  
  // TODO: Validate API key against database
  // For now, just check if it's not a default/test key
  if (apiKey.includes('test') || apiKey.includes('example')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }
  
  next();
};

module.exports = {
  requestId,
  securityHeaders,
  corsMiddleware,
  compressionMiddleware,
  createRateLimit,
  createSlowDown,
  ipWhitelist,
  requestSizeLimit,
  securityAudit,
  suspiciousActivityDetector,
  requestTimeout,
  validateContentType,
  validateApiKey,
  
  // Convenience exports for common rate limits
  globalRateLimit: createRateLimit('global'),
  authRateLimit: createRateLimit('auth'),
  registerRateLimit: createRateLimit('register'),
  passwordResetRateLimit: createRateLimit('passwordReset'),
  apiRateLimit: createRateLimit('api'),
  
  // Convenience exports for slow down
  globalSlowDown: createSlowDown('global'),
  authSlowDown: createSlowDown('auth'),
};
