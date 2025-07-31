const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * WebSocket authentication middleware
 */
const authenticateSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token (using auth service secret - in production, validate with auth service)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production');
    
    socket.userId = decoded.sub;
    socket.userRole = decoded.role;
    
    logger.debug('Socket authenticated', { 
      socketId: socket.id, 
      userId: socket.userId, 
      role: socket.userRole 
    });
    
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error);
    next(new Error('Invalid authentication token'));
  }
};

/**
 * Setup WebSocket server with event handlers
 */
const setupWebSocket = (io) => {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.info('Client connected', { 
      socketId: socket.id, 
      userId: socket.userId, 
      role: socket.userRole 
    });

    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Join role-specific rooms
    if (socket.userRole === 'delivery_driver') {
      socket.join('drivers');
    } else if (socket.userRole === 'supplier') {
      socket.join('suppliers');
    }

    // Handle order tracking subscription
    socket.on('subscribe_order', (orderId) => {
      // Verify user has access to this order
      // In production, check database for order ownership
      socket.join(`order:${orderId}`);
      logger.debug('Subscribed to order updates', { 
        socketId: socket.id, 
        userId: socket.userId, 
        orderId 
      });
    });

    // Handle delivery tracking subscription
    socket.on('subscribe_delivery', (orderId) => {
      socket.join(`delivery:${orderId}`);
      logger.debug('Subscribed to delivery updates', { 
        socketId: socket.id, 
        userId: socket.userId, 
        orderId 
      });
    });

    // Handle driver location updates
    socket.on('driver_location_update', (data) => {
      if (socket.userRole !== 'delivery_driver') {
        return socket.emit('error', { message: 'Unauthorized' });
      }

      const { orderId, latitude, longitude } = data;
      
      // Broadcast location update to order subscribers
      socket.to(`delivery:${orderId}`).emit('driver_location', {
        orderId,
        driverId: socket.userId,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
      });

      logger.debug('Driver location updated', { 
        driverId: socket.userId, 
        orderId, 
        latitude, 
        longitude 
      });
    });

    // Handle emergency SOS alerts
    socket.on('emergency_sos', (data) => {
      const { orderId, location, message } = data;
      
      // Broadcast to all suppliers and drivers in the area
      io.to('suppliers').to('drivers').emit('emergency_alert', {
        orderId,
        userId: socket.userId,
        location,
        message,
        timestamp: new Date().toISOString(),
      });

      logger.warn('Emergency SOS alert', { 
        userId: socket.userId, 
        orderId, 
        location, 
        message 
      });
    });

    // Handle order status updates from suppliers
    socket.on('order_status_update', (data) => {
      if (socket.userRole !== 'supplier' && socket.userRole !== 'delivery_driver') {
        return socket.emit('error', { message: 'Unauthorized' });
      }

      const { orderId, status, message } = data;
      
      // Broadcast to order subscribers
      socket.to(`order:${orderId}`).emit('order_status_changed', {
        orderId,
        status,
        message,
        updatedBy: socket.userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Order status updated via WebSocket', { 
        orderId, 
        status, 
        updatedBy: socket.userId 
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected', { 
        socketId: socket.id, 
        userId: socket.userId, 
        reason 
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', { 
        socketId: socket.id, 
        userId: socket.userId, 
        error: error.message 
      });
    });
  });

  // Connection error handling
  io.on('connect_error', (error) => {
    logger.error('WebSocket connection error:', error);
  });

  logger.info('WebSocket server initialized');
};

/**
 * Broadcast order update to subscribers
 */
const broadcastOrderUpdate = (orderId, update) => {
  if (global.io) {
    global.io.to(`order:${orderId}`).emit('order_updated', {
      orderId,
      ...update,
      timestamp: new Date().toISOString(),
    });
    
    logger.debug('Order update broadcasted', { orderId, update });
  }
};

/**
 * Broadcast delivery update to subscribers
 */
const broadcastDeliveryUpdate = (orderId, update) => {
  if (global.io) {
    global.io.to(`delivery:${orderId}`).emit('delivery_updated', {
      orderId,
      ...update,
      timestamp: new Date().toISOString(),
    });
    
    logger.debug('Delivery update broadcasted', { orderId, update });
  }
};

/**
 * Send notification to specific user
 */
const sendUserNotification = (userId, notification) => {
  if (global.io) {
    global.io.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
    
    logger.debug('User notification sent', { userId, notification });
  }
};

/**
 * Broadcast emergency alert
 */
const broadcastEmergencyAlert = (alert) => {
  if (global.io) {
    global.io.to('suppliers').to('drivers').emit('emergency_alert', {
      ...alert,
      timestamp: new Date().toISOString(),
    });
    
    logger.warn('Emergency alert broadcasted', alert);
  }
};

/**
 * Send driver assignment notification
 */
const notifyDriverAssignment = (driverId, orderDetails) => {
  if (global.io) {
    global.io.to(`user:${driverId}`).emit('driver_assigned', {
      ...orderDetails,
      timestamp: new Date().toISOString(),
    });
    
    logger.info('Driver assignment notification sent', { driverId, orderId: orderDetails.orderId });
  }
};

module.exports = {
  setupWebSocket,
  broadcastOrderUpdate,
  broadcastDeliveryUpdate,
  sendUserNotification,
  broadcastEmergencyAlert,
  notifyDriverAssignment,
};
