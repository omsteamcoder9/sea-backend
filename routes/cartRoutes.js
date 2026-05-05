import {
  addToCart,
  getCart,
  mergeCart,
  updateCartItem,
  removeFromCart,
  clearCart
} from '../controllers/cartController.js';
import { requireAuth, requireStrictAuth } from '../controllers/authController.js';

async function cartRoutes(fastify, options) {
  
  // ✅ FIXED: Add requireAuth middleware to all cart routes
  // This attaches the user to request.user for authenticated requests
  fastify.post('/cart', { preHandler: requireAuth }, addToCart);
  fastify.get('/cart', { preHandler: requireAuth }, getCart);
  fastify.put('/cart/items/:itemId', { preHandler: requireAuth }, updateCartItem);
  fastify.delete('/cart/items/:itemId', { preHandler: requireAuth }, removeFromCart);
  fastify.delete('/cart', { preHandler: requireAuth }, clearCart);
  
  // Protected routes (require authentication for merging)
  fastify.post('/cart/merge', { preHandler: requireStrictAuth }, mergeCart);
}

export default cartRoutes;