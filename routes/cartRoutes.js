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
  
  // Public routes (guest cart - auth optional)
  fastify.post('/cart', addToCart);
  fastify.get('/cart', getCart);
  fastify.put('/cart/items/:itemId', updateCartItem);
  fastify.delete('/cart/items/:itemId', removeFromCart);
  fastify.delete('/cart', clearCart);
  
  // Protected routes (require authentication for merging)
  fastify.post('/cart/merge', { preHandler: requireStrictAuth }, mergeCart);
}

export default cartRoutes;