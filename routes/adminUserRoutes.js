// routes/adminUserRoutes.js
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  restoreUser,
  getUserStatsSummary,
  createAdminUser,
  bulkUserAction
} from '../controllers/adminUserController.js';

async function adminUserRoutes(fastify, options) {
  
  // User management routes (Admin only)
  fastify.get('/admin/users', {
    preHandler: [fastify.requireAdmin],
    handler: getAllUsers
  });
  
  fastify.get('/admin/users/stats', {
    preHandler: [fastify.requireAdmin],
    handler: getUserStatsSummary
  });
  
  fastify.get('/admin/users/:id', {
    preHandler: [fastify.requireAdmin],
    handler: getUserById
  });
  
  fastify.put('/admin/users/:id', {
    preHandler: [fastify.requireAdmin],
    handler: updateUser
  });
  
  fastify.delete('/admin/users/:id', {
    preHandler: [fastify.requireAdmin],
    handler: deleteUser
  });
  
  fastify.patch('/admin/users/:id/restore', {
    preHandler: [fastify.requireAdmin],
    handler: restoreUser
  });
  
  fastify.post('/admin/users/create-admin', {
    preHandler: [fastify.requireAdmin],
    handler: createAdminUser
  });
  
  fastify.post('/admin/users/bulk-action', {
    preHandler: [fastify.requireAdmin],
    handler: bulkUserAction
  });
}

export default adminUserRoutes;