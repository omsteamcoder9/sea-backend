// routes/returnRoutes.js
import {
  getReturnPolicy,
  getReturnPolicyById,
  createReturnPolicy,
  updateReturnPolicy,
  deleteReturnPolicy,
} from '../controllers/returnController.js';

export default async function returnRoutes(fastify, options) {
  // 🌐 PUBLIC — frontend /returns page
  fastify.get('/returns', getReturnPolicy);

  // 🔐 ADMIN — CRUD (using requireAdmin decorated in server.js)
  fastify.get(
    '/admin/returns/:id',
    { preHandler: [fastify.requireAdmin] },
    getReturnPolicyById
  );

  fastify.post(
    '/admin/returns',
    { preHandler: [fastify.requireAdmin] },
    createReturnPolicy
  );

  fastify.put(
    '/admin/returns/:id',
    { preHandler: [fastify.requireAdmin] },
    updateReturnPolicy
  );

  fastify.delete(
    '/admin/returns/:id',
    { preHandler: [fastify.requireAdmin] },
    deleteReturnPolicy
  );
}