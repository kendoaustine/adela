const serviceManager = require('../services/serviceManager');
const logger = require('../utils/logger');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

/**
 * Authentication middleware - validates JWT token via Auth Service
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Access token required');
    }

    const token = authHeader.substring(7);

    // Validate token via Auth Service
    const { user, token: tokenData } = await serviceManager.validateUserToken(token);

    // Attach user and token data to request
    req.user = user;
    req.token = tokenData;

    logger.debug('User authenticated via auth service', { 
      userId: user.id, 
      role: user.role,
      service: 'orders'
    });

    next();
  } catch (error) {
    logger.error('Authentication failed:', { 
      error: error.message,
      path: req.path,
      method: req.method 
    });
    
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      next(error);
    } else {
      next(new AuthenticationError('Authentication failed'));
    }
  }
};

/**
 * Authorization middleware - checks user roles
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('User not authenticated');
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
        throw new AuthorizationError(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
      }

      next();
    } catch (error) {
      logger.error('Authorization failed:', { 
        error: error.message,
        userId: req.user?.id,
        userRole: req.user?.role,
        allowedRoles,
        path: req.path,
        method: req.method 
      });
      
      next(error);
    }
  };
};

/**
 * Ownership authorization - ensures user can only access their own resources
 */
const authorizeOwnership = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('User not authenticated');
      }

      // Skip ownership check for suppliers and admins
      if (['supplier', 'admin', 'delivery_driver'].includes(req.user.role)) {
        return next();
      }

      // For households, check ownership
      const resourceUserId = req.resource?.[resourceUserIdField] || req.params.userId;
      
      if (resourceUserId && resourceUserId !== req.user.id) {
        throw new AuthorizationError('Access denied. You can only access your own resources.');
      }

      next();
    } catch (error) {
      logger.error('Ownership authorization failed:', { 
        error: error.message,
        userId: req.user?.id,
        resourceUserId: req.resource?.[resourceUserIdField],
        path: req.path,
        method: req.method 
      });
      
      next(error);
    }
  };
};

/**
 * Request ID middleware for tracing
 */
const requestId = (req, res, next) => {
  const { v4: uuidv4 } = require('uuid');
  const id = req.headers['x-request-id'] || uuidv4();
  
  req.requestId = id;
  res.set('X-Request-ID', id);
  
  // Store globally for logger
  global.requestId = id;
  
  next();
};

/**
 * Audit logging middleware
 */
const auditLog = (action) => {
  return (req, res, next) => {
    // Store original send function
    const originalSend = res.send;
    
    // Override send function to capture response
    res.send = function(data) {
      // Log the action
      logger.info('User action', {
        action,
        userId: req.user?.id,
        userRole: req.user?.role,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Rate limiting by user
 */
const rateLimitByUser = (options = {}) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || 100,
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  authenticate,
  authorize,
  authorizeOwnership,
  requestId,
  auditLog,
  rateLimitByUser,
};
