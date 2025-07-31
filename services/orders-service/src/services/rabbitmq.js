const amqp = require('amqplib');
const config = require('../config');
const logger = require('../utils/logger');

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ
 */
const connectRabbitMQ = async () => {
  try {
    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();
    
    // Handle connection events
    connection.on('error', (err) => {
      logger.error('RabbitMQ connection error:', err);
    });
    
    connection.on('close', () => {
      logger.info('RabbitMQ connection closed');
    });
    
    // Declare exchanges
    await channel.assertExchange(config.rabbitmq.exchanges.auth, 'topic', { durable: true });
    await channel.assertExchange(config.rabbitmq.exchanges.orders, 'topic', { durable: true });
    await channel.assertExchange(config.rabbitmq.exchanges.supplier, 'topic', { durable: true });
    
    // Declare queues
    await channel.assertQueue(config.rabbitmq.queues.userCreated, { durable: true });
    await channel.assertQueue(config.rabbitmq.queues.userUpdated, { durable: true });
    await channel.assertQueue(config.rabbitmq.queues.userVerified, { durable: true });
    await channel.assertQueue(config.rabbitmq.queues.supplierVerified, { durable: true });
    
    // Bind queues to exchanges
    await channel.bindQueue(config.rabbitmq.queues.userCreated, config.rabbitmq.exchanges.auth, 'user.created');
    await channel.bindQueue(config.rabbitmq.queues.userUpdated, config.rabbitmq.exchanges.auth, 'user.updated');
    await channel.bindQueue(config.rabbitmq.queues.userVerified, config.rabbitmq.exchanges.auth, 'user.verified');
    await channel.bindQueue(config.rabbitmq.queues.supplierVerified, config.rabbitmq.exchanges.auth, 'supplier.verified');
    
    logger.info('RabbitMQ connected successfully');
    return { connection, channel };
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ:', error);
    throw error;
  }
};

/**
 * Get the RabbitMQ channel
 */
const getChannel = () => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ() first.');
  }
  return channel;
};

/**
 * Publish an event to an exchange
 */
const publishEvent = async (exchange, routingKey, data, options = {}) => {
  try {
    const mqChannel = getChannel();
    const message = Buffer.from(JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
      service: 'auth-service',
    }));
    
    const publishOptions = {
      persistent: true,
      messageId: require('uuid').v4(),
      timestamp: Date.now(),
      ...options,
    };
    
    const published = mqChannel.publish(exchange, routingKey, message, publishOptions);
    
    if (published) {
      logger.debug('Event published', { exchange, routingKey, messageId: publishOptions.messageId });
    } else {
      logger.warn('Event not published - channel buffer full', { exchange, routingKey });
    }
    
    return published;
  } catch (error) {
    logger.error('Failed to publish event:', error);
    throw error;
  }
};

/**
 * Event publishing helpers
 */
const eventService = {
  /**
   * Publish user created event
   */
  async userCreated(userData) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'user.created', {
      eventType: 'user.created',
      userId: userData.id,
      email: userData.email,
      role: userData.role,
      profile: userData.profile,
    });
  },

  /**
   * Publish user updated event
   */
  async userUpdated(userId, changes) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'user.updated', {
      eventType: 'user.updated',
      userId,
      changes,
    });
  },

  /**
   * Publish user verified event
   */
  async userVerified(userId, verificationType) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'user.verified', {
      eventType: 'user.verified',
      userId,
      verificationType, // 'email' or 'phone'
    });
  },

  /**
   * Publish supplier verified event
   */
  async supplierVerified(supplierId, verificationStatus) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'supplier.verified', {
      eventType: 'supplier.verified',
      supplierId,
      verificationStatus, // 'approved' or 'rejected'
    });
  },

  /**
   * Publish user login event
   */
  async userLogin(userId, loginData) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'user.login', {
      eventType: 'user.login',
      userId,
      ip: loginData.ip,
      userAgent: loginData.userAgent,
      timestamp: loginData.timestamp,
    });
  },

  /**
   * Publish user logout event
   */
  async userLogout(userId) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'user.logout', {
      eventType: 'user.logout',
      userId,
    });
  },

  /**
   * Publish password reset event
   */
  async passwordReset(userId, email) {
    return publishEvent(config.rabbitmq.exchanges.auth, 'user.password.reset', {
      eventType: 'user.password.reset',
      userId,
      email,
    });
  },
};

/**
 * Set up event consumers (if needed)
 */
const setupConsumers = async () => {
  try {
    const mqChannel = getChannel();
    
    // Example: Listen for events from other services
    // This would be used if auth service needs to react to events from orders/supplier services
    
    logger.info('Event consumers set up successfully');
  } catch (error) {
    logger.error('Failed to set up event consumers:', error);
    throw error;
  }
};

/**
 * Close RabbitMQ connection
 */
const closeRabbitMQ = async () => {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    
    if (connection) {
      await connection.close();
      connection = null;
    }
    
    logger.info('RabbitMQ connection closed');
  } catch (error) {
    logger.error('Error closing RabbitMQ connection:', error);
  }
};

/**
 * Check RabbitMQ health
 */
const checkHealth = async () => {
  try {
    if (!connection || !channel) {
      throw new Error('RabbitMQ not connected');
    }
    
    // Try to declare a temporary queue to test the connection
    const testQueue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
    await channel.deleteQueue(testQueue.queue);
    
    return {
      status: 'healthy',
      message: 'RabbitMQ connection is working',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

module.exports = {
  connectRabbitMQ,
  getChannel,
  publishEvent,
  eventService,
  setupConsumers,
  closeRabbitMQ,
  checkHealth,
};
