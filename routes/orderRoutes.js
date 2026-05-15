import { 
  createOrder, 
  getUserOrders, 
  getOrderById 
} from '../controllers/orderController.js';
import { requireStrictAuth } from '../controllers/authController.js';

async function orderRoutes(fastify, options) {
  
  // Create order (authenticated users only)
  fastify.post('/orders', { preHandler: requireStrictAuth }, createOrder);
  
  // Get user's orders (authenticated users only)
  fastify.get('/orders/my-orders', { preHandler: requireStrictAuth }, getUserOrders);
  
  // Get single order by ID (authenticated users only)
  fastify.get('/orders/:id', { preHandler: requireStrictAuth }, getOrderById);
  
}

export default orderRoutes;