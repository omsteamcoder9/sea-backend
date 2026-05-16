// routes/paymentRoutes.js
import {
  createRazorpayOrder,
  verifyPayment,
  paymentFailed,
  getPaymentStatus,
  refundPayment
} from '../controllers/paymentController.js';
import { requireStrictAuth, requireAdmin } from '../controllers/authController.js';

async function paymentRoutes(fastify, options) {
  
  console.log('✅ Payment routes registered');
  
  // Create Razorpay order
  fastify.post('/payments/create-order', createRazorpayOrder);
  
  // Verify payment (callback from Razorpay)
  fastify.post('/payments/verify-payment', verifyPayment);
  
  // Payment failed callback
  fastify.post('/payments/payment-failed', paymentFailed);
  
  // Get payment status by order ID (authenticated users)
  fastify.get('/payments/status/:orderId', { preHandler: requireStrictAuth }, getPaymentStatus);
  
  // Refund payment (Admin only)
  fastify.post('/payments/refund/:paymentId', { preHandler: requireAdmin }, refundPayment);
  
  // Test route
  fastify.get('/payments/test', async (request, reply) => {
    return reply.send({ success: true, message: 'Payment routes working' });
  });
}

export default paymentRoutes;