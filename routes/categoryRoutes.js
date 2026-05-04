import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';
import { requireAdmin } from '../controllers/authController.js';

async function categoryRoutes(fastify, options) {
  
  // Create category (Admin only)
  fastify.post('/categories', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 }
        }
      }
    }
  }, createCategory);
  
  // Get all categories (Public)
  fastify.get('/categories', getAllCategories);
  
  // Get single category (Public)
  fastify.get('/categories/:id', getCategoryById);
  
  // Update category (Admin only)
  fastify.put('/categories/:id', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 }
        }
      }
    }
  }, updateCategory);
  
  // Delete category (Admin only)
  fastify.delete('/categories/:id', {
    preHandler: requireAdmin
  }, deleteCategory);
}

export default categoryRoutes;