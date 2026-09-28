// routes/shippingRoutes.js
import {
  getShippingInfo,
  getShippingById,
  createShippingInfo,
  updateShippingInfo,
  deleteShippingInfo,
} from '../controllers/shippingController.js';

export default async function shippingRoutes(fastify, options) {
  // 🌐 PUBLIC — frontend /shipping page
  fastify.get('/shipping', getShippingInfo);

  // 🔐 ADMIN — CRUD (using requireAdmin decorated in server.js)
  fastify.get(
    '/admin/shipping/:id',
    { preHandler: [fastify.requireAdmin] },
    getShippingById
  );

  fastify.post(
    '/admin/shipping',
    { preHandler: [fastify.requireAdmin] },
    createShippingInfo
  );

  fastify.put(
    '/admin/shipping/:id',
    { preHandler: [fastify.requireAdmin] },
    updateShippingInfo
  );

  fastify.delete(
    '/admin/shipping/:id',
    { preHandler: [fastify.requireAdmin] },
    deleteShippingInfo
  );
}