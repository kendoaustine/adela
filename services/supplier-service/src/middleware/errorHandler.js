const logger = require('../utils/logger');
const config = require('../config');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class BusinessLogicError extends AppError {
  constructor(message = 'Business logic error') {
    super(message, 422, 'BUSINESS_LOGIC_ERROR');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.retryAfter = retryAfter;
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database error') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = null) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

/**
 * Handle different types of errors
 */
const handleDatabaseError = (error) => {
  logger.error('Database error:', error);
  
  // PostgreSQL specific error codes
  switch (error.code) {
    case '23505': // unique_violation
      return new ConflictError('Resource already exists');
    case '23503': // foreign_key_violation
      return new ValidationError('Referenced resource does not exist');
    case '23502': // not_null_violation
      return new ValidationError('Required field is missing');
    case '23514': // check_violation
      return new ValidationError('Data validation failed');
    case '42P01': // undefined_table
      return new DatabaseError('Database table not found');
    case '42703': // undefined_column
      return new DatabaseError('Database column not found');
    default:
      return new DatabaseError('Database operation failed');
  }
};

const handleJWTError = (error) => {
  logger.error('JWT error:', error);
  
  switch (error.name) {
    case 'JsonWebTokenError':
      return new AuthenticationError('Invalid token');
    case 'TokenExpiredError':
      return new AuthenticationError('Token expired');
    case 'NotBeforeError':
      return new AuthenticationError('Token not active');
    default:
      return new AuthenticationError('Token validation failed');
  }
};

const handleValidationError = (error) => {
  logger.error('Validation error:', error);
  
  if (error.details) {
    // Joi validation error
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value,
    }));
    
    return new ValidationError('Validation failed', errors);
  }
  
  return new ValidationError(error.message);
};

/**
 * Main error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  let err = error;
  
  // Log the original error
  logger.logError(error, req);
  
  // Handle specific error types
  if (error.name === 'ValidationError' || error.isJoi) {
    err = handleValidationError(error);
  } else if (error.code && error.code.startsWith('23')) {
    // PostgreSQL constraint violations
    err = handleDatabaseError(error);
  } else if (error.name && error.name.includes('JWT')) {
    err = handleJWTError(error);
  } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    err = new ExternalServiceError('External service unavailable');
  } else if (!error.isOperational) {
    // Unknown error - don't leak details in production
    err = new AppError(
      config.nodeEnv === 'production' ? 'Something went wrong' : error.message,
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
  
  // Prepare error response
  const errorResponse = {
    error: {
      message: err.message,
      code: err.code || 'UNKNOWN_ERROR',
      statusCode: err.statusCode || 500,
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
  };
  
  // Add additional error details in development
  if (config.nodeEnv === 'development') {
    errorResponse.error.stack = err.stack;
    
    if (err.errors) {
      errorResponse.error.details = err.errors;
    }
  }
  
  // Add validation errors
  if (err instanceof ValidationError && err.errors) {
    errorResponse.error.validation = err.errors;
  }
  
  // Add rate limit headers
  if (err instanceof RateLimitError && err.retryAfter) {
    res.set('Retry-After', err.retryAfter);
  }
  
  // Add request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }
  
  // Security headers for error responses
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });
  
  // Send error response
  res.status(err.statusCode || 500).json(errorResponse);
};

/**
 * Handle 404 errors
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`);
  next(error);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  
  // Middleware
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
