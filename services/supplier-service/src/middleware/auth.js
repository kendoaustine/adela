const AuthServiceClient = require('../lib/service-clients/authServiceClient');
const logger = require('../utils/logger');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');

// Initialize Auth Service client
const authServiceClient = new AuthServiceClient();

/**
 * Authentication middleware - verifies JWT token via auth service
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Access token required');
    }

    const token = authHeader.substring(7);

    // Validate token via Auth Service client
    try {
      const result = await authServiceClient.validateToken(token);

      if (!result.isValid) {
        throw new AuthenticationError(result.error || 'Invalid token');
      }

      // Attach user and token data to request
      req.user = result.user;
      req.token = result.token;

      logger.debug('User authenticated via auth service', {
        userId: result.user.id,
        role: result.user.role,
        service: 'supplier'
      });

      next();
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        throw error;
      } else {
        logger.error('Auth service communication failed:', { error: error.message });
        throw new AuthenticationError('Authentication service unavailable');
      }
    }
  } catch (error) {
    logger.error('Authentication failed:', {
      error: error.message,
      path: req.path,
      method: req.method
    });

    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      next(error);
    } else {
      next(new AuthenticationError('Invalid or expired token'));
    }
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTService.extractTokenFromHeader(authHeader);

    if (token) {
      const decoded = JWTService.verifyAccessToken(token);
      const user = await User.findById(decoded.sub);
      
      if (user && user.isActive && !user.isLocked()) {
        req.user = user;
        req.token = decoded;
      }
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    logger.debug('Optional authentication failed:', error.message);
    next();
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Authorization failed', {
        userId: req.user.id,
        userRole: req.user.role,
        allowedRoles,
        endpoint: req.originalUrl,
      });
      
      return next(new AuthorizationError('Insufficient permissions'));
    }

    logger.debug('User authorized', {
      userId: req.user.id,
      role: req.user.role,
      endpoint: req.originalUrl,
    });

    next();
  };
};

/**
 * Resource ownership authorization
 */
const authorizeOwnership = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Platform admins can access any resource
    if (req.user.role === 'platform_admin') {
      return next();
    }

    // Check if user owns the resource
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (resourceUserId && resourceUserId !== req.user.id) {
      logger.warn('Ownership authorization failed', {
        userId: req.user.id,
        resourceUserId,
        endpoint: req.originalUrl,
      });
      
      return next(new AuthorizationError('Access denied - resource ownership required'));
    }

    next();
  };
};

/**
 * Verification requirement middleware
 */
const requireVerification = (verificationType = 'email') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    let isVerified = false;
    
    switch (verificationType) {
      case 'email':
        isVerified = !!req.user.emailVerifiedAt;
        break;
      case 'phone':
        isVerified = !!req.user.phoneVerifiedAt;
        break;
      case 'any':
        isVerified = !!req.user.emailVerifiedAt || !!req.user.phoneVerifiedAt;
        break;
      case 'both':
        isVerified = !!req.user.emailVerifiedAt && !!req.user.phoneVerifiedAt;
        break;
      default:
        isVerified = req.user.isVerified;
    }

    if (!isVerified) {
      return next(new AuthorizationError(`${verificationType} verification required`));
    }

    next();
  };
};

/**
 * Supplier verification middleware
 */
const requireSupplierVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (req.user.role !== 'supplier') {
      return next(new AuthorizationError('Supplier role required'));
    }

    // Check supplier verification status
    const { query } = require('../database/connection');
    const result = await query(
      `SELECT verification_status 
       FROM auth.supplier_documents 
       WHERE supplier_id = $1 AND verification_status = 'approved'
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return next(new AuthorizationError('Supplier verification required'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rate limiting by user ID
 */
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const { rateLimitService } = require('../services/redis');
  
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next();
      }

      const identifier = `user:${req.user.id}`;
      const rateLimit = await rateLimitService.checkRateLimit(
        identifier, 
        maxRequests, 
        windowMs
      );

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': rateLimit.remaining,
        'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      });

      if (rateLimit.blocked) {
        logger.warn('User rate limit exceeded', {
          userId: req.user.id,
          attempts: rateLimit.attempts,
          maxAttempts: maxRequests,
        });

        return res.status(429).json({
          error: {
            message: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
          },
        });
      }

      next();
    } catch (error) {
      // Don't fail the request if rate limiting fails
      logger.error('Rate limiting error:', error);
      next();
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
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action after response
      setImmediate(() => {
        logger.info('Audit log', {
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
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  authorizeOwnership,
  requireVerification,
  requireSupplierVerification,
  rateLimitByUser,
  requestId,
  auditLog,
};
