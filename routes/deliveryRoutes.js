import jwt from 'jsonwebtoken';
import { 
  deliveryLogin,
  getMyOrders,
  getOrderHistory,
  getOrderDetails,
  markPickedUp,
  markDelivered,
  getProfile,
  updateProfile,
  getStats
} from '../controllers/deliveryController.js';

// Middleware for delivery boy authentication
const requireDeliveryAuth = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        success: false, 
        message: 'No token provided. Please login.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return reply.status(401).send({ 
        success: false, 
        message: 'Invalid token format' 
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'delivery_boy') {
      return reply.status(403).send({ 
        success: false, 
        message: 'Access denied. Not a delivery boy account.' 
      });
    }
    
    request.user = decoded;
    return;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return reply.status(401).send({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ 
        success: false, 
        message: 'Token expired. Please login again.' 
      });
    }
    return reply.status(401).send({ 
      success: false, 
      message: 'Authentication failed' 
    });
  }
};

async function deliveryRoutes(fastify, options) {
  
  // ========== PUBLIC ROUTES ==========
  // Delivery boy login
  fastify.post('/delivery/login', deliveryLogin);
  
  // ========== PROTECTED ROUTES (Require Authentication) ==========
  
  // Profile
  fastify.get('/delivery/profile', { preHandler: requireDeliveryAuth }, getProfile);
  fastify.put('/delivery/profile', { preHandler: requireDeliveryAuth }, updateProfile);
  
  // Dashboard Stats
  fastify.get('/delivery/stats', { preHandler: requireDeliveryAuth }, getStats);
  
  // Orders
  fastify.get('/delivery/orders', { preHandler: requireDeliveryAuth }, getMyOrders);
  fastify.get('/delivery/orders/history', { preHandler: requireDeliveryAuth }, getOrderHistory);
  fastify.get('/delivery/orders/:orderId', { preHandler: requireDeliveryAuth }, getOrderDetails);
  
  // Order Actions
  fastify.put('/delivery/orders/:orderId/pickup', { preHandler: requireDeliveryAuth }, markPickedUp);
  fastify.put('/delivery/orders/:orderId/deliver', { preHandler: requireDeliveryAuth }, markDelivered);
  
  console.log('✅ Delivery routes registered');
}

export default deliveryRoutes;