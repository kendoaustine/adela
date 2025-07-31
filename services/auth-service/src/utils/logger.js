const winston = require('winston');
const config = require('../config');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

// Define format for JSON logs (production)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: config.nodeEnv === 'production' ? jsonFormat : format,
  }),
];

// Add file transports in production
if (config.nodeEnv === 'production') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: jsonFormat,
    }),
    // Combined log file
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: jsonFormat,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  levels,
  format: config.nodeEnv === 'production' ? jsonFormat : format,
  transports,
  // Handle uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new winston.transports.Console({
      format: config.nodeEnv === 'production' ? jsonFormat : format,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: config.nodeEnv === 'production' ? jsonFormat : format,
    }),
  ],
  exitOnError: false,
});

// Create a stream object for Morgan HTTP request logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Add request ID to logs if available
const originalLog = logger.log;
logger.log = function(level, message, meta = {}) {
  // Add service name to all logs
  meta.service = 'auth-service';
  
  // Add request ID if available (from middleware)
  if (global.requestId) {
    meta.requestId = global.requestId;
  }
  
  return originalLog.call(this, level, message, meta);
};

// Helper methods for structured logging
logger.logRequest = (req, res, responseTime) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
  });
};

logger.logError = (error, req = null) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    name: error.name,
  };
  
  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      userId: req.user?.id,
      ip: req.ip,
    };
  }
  
  logger.error('Application Error', errorLog);
};

logger.logAuth = (action, userId, details = {}) => {
  logger.info('Authentication Event', {
    action,
    userId,
    ...details,
  });
};

logger.logSecurity = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    ...details,
  });
};

module.exports = logger;
