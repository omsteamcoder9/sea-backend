import { 
  getAllDeliveryBoys,
  getDeliveryBoyById,
  addDeliveryBoy,
  updateDeliveryBoy,
  deleteDeliveryBoy,
  getWardsList,
  getUnassignedOrders,
  assignOrderToDeliveryBoy,
  getDeliveryBoyStats,
  getDeliveryBoyOrders
} from '../controllers/adminDeliveryController.js';
import { requireAdmin } from '../controllers/authController.js';

async function adminDeliveryRoutes(fastify, options) {
  
  // ========== ALL ROUTES REQUIRE ADMIN AUTHENTICATION ==========
  
  // Delivery Boy Management
  fastify.get('/admin/delivery-boys', { preHandler: requireAdmin }, getAllDeliveryBoys);
  fastify.get('/admin/delivery-boys/:id', { preHandler: requireAdmin }, getDeliveryBoyById);
  fastify.post('/admin/delivery-boys', { preHandler: requireAdmin }, addDeliveryBoy);
  fastify.put('/admin/delivery-boys/:id', { preHandler: requireAdmin }, updateDeliveryBoy);
  fastify.delete('/admin/delivery-boys/:id', { preHandler: requireAdmin }, deleteDeliveryBoy);
  
  // Wards List (for dropdown)
  fastify.get('/admin/wards', { preHandler: requireAdmin }, getWardsList);
  
  // Delivery Stats
  fastify.get('/admin/delivery/stats', { preHandler: requireAdmin }, getDeliveryBoyStats);
  fastify.get('/admin/delivery-boys/:id/stats', { preHandler: requireAdmin }, getDeliveryBoyStats);  // ✅ ADD THIS LINE
  fastify.get('/admin/delivery-boys/:id/orders', { preHandler: requireAdmin }, getDeliveryBoyOrders);
  
  // Order Assignment
  fastify.get('/admin/orders/unassigned', { preHandler: requireAdmin }, getUnassignedOrders);
  fastify.post('/admin/orders/assign', { preHandler: requireAdmin }, assignOrderToDeliveryBoy);
  
  console.log('✅ Admin delivery routes registered');
}

export default adminDeliveryRoutes;