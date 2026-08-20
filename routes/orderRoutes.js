import { 
  createOrder, 
  getUserOrders, 
  getOrderById,
  getAllOrders,
  getOrderStats,
  updateOrderStatus,
  getAdminOrderById,
  deleteOrder,
  cancelOrder,
  updateOrderStatusByOrderId,
  updateOrderPaymentSuccess,
  updateOrderPaymentFailed,
  printOrderReceipt,
  getOrderByRazorpayOrderId,
  printOrderReceiptPDF,
  processRefund  // ADD THIS IMPORT
} from '../controllers/orderController.js';
import { requireStrictAuth } from '../controllers/authController.js';

async function orderRoutes(fastify, options) {
  
  // ========== USER ROUTES ==========
  
  // Create order (authenticated users only)
  fastify.post('/orders', { preHandler: requireStrictAuth }, createOrder);
  
  // Get user's orders (authenticated users only)
  fastify.get('/orders/my-orders', { preHandler: requireStrictAuth }, getUserOrders);
  
  // Get single order by ID (authenticated users only)
  fastify.get('/orders/:id', { preHandler: requireStrictAuth }, getOrderById);
  
  // Cancel order (user can cancel their own order)
  fastify.put('/orders/:id/cancel', { preHandler: requireStrictAuth }, cancelOrder);
  // Get order by Razorpay order ID
// Used by Flutter to recover payment status if verification response is interrupted
fastify.get(
  '/orders/razorpay/:razorpayOrderId',
  { preHandler: requireStrictAuth },
  getOrderByRazorpayOrderId
);
  // Print order receipt (JSON)
  fastify.get('/orders/:id/receipt', { preHandler: requireStrictAuth }, printOrderReceipt);
  
  // Print order receipt PDF
  fastify.get('/orders/:id/receipt/pdf', { preHandler: requireStrictAuth }, printOrderReceiptPDF);
  
  // ========== ADMIN ROUTES ==========
  
  // Get all orders with filters & pagination (admin only)
  fastify.get('/admin/orders', { preHandler: requireStrictAuth }, getAllOrders);
  
  // Get order statistics (admin only)
  fastify.get('/admin/orders/stats', { preHandler: requireStrictAuth }, getOrderStats);
  
  // Update order status (admin only) - PATCH method
  fastify.patch('/admin/orders/:id/status', { preHandler: requireStrictAuth }, updateOrderStatus);
  
  // Get single order details for admin (admin only)
  fastify.get('/admin/orders/:id', { preHandler: requireStrictAuth }, getAdminOrderById);
  
  // Delete order (admin only)
  fastify.delete('/admin/orders/:id', { preHandler: requireStrictAuth }, deleteOrder);
  
  // Update order status by orderId (not MongoDB _id) - admin only
  fastify.put('/admin/orders/order-status/:orderId', { preHandler: requireStrictAuth }, updateOrderStatusByOrderId);
  
  // ========== REFUND ROUTE (Admin only) ==========
  // Process refund for an order
  fastify.post('/admin/orders/:id/refund', { preHandler: requireStrictAuth }, processRefund);
  
  // ========== PAYMENT WEBHOOK ROUTES (Public) ==========
  
  // Payment success webhook (called by Razorpay)
  fastify.put('/orders/payment-success', updateOrderPaymentSuccess);
  
  // Payment failed webhook (called by Razorpay)
  fastify.put('/orders/payment-failed', updateOrderPaymentFailed);
}

export default orderRoutes;