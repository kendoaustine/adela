/**
 * Simple logger for shared HTTP client
 * Uses console with structured logging format
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  return JSON.stringify({
    timestamp,
    level: level.toUpperCase(),
    message,
    service: 'http-client',
    ...meta
  });
}

const logger = {
  error: (message, meta) => {
    if (currentLevel >= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },
  
  warn: (message, meta) => {
    if (currentLevel >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },
  
  info: (message, meta) => {
    if (currentLevel >= LOG_LEVELS.info) {
      console.info(formatMessage('info', message, meta));
    }
  },
  
  debug: (message, meta) => {
    if (currentLevel >= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  }
};

module.exports = logger;
