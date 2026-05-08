import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';
import { requireAdmin } from '../controllers/authController.js';

async function categoryRoutes(fastify, options) {
  
  // Create category (Admin only) - with image upload
  // Remove schema validation for multipart/form-data
  fastify.post('/categories', {
    preHandler: [requireAdmin, fastify.uploadImages, fastify.optimizeImages]
  }, createCategory);
  
  // Get all categories (Public)
  fastify.get('/categories', getAllCategories);
  
  // Get single category (Public)
  fastify.get('/categories/:id', getCategoryById);
  
  // Update category (Admin only) - with image upload
  // Remove schema validation for multipart/form-data
  fastify.put('/categories/:id', {
    preHandler: [requireAdmin, fastify.uploadImages, fastify.optimizeImages]
  }, updateCategory);
  
  // Delete category (Admin only)
  fastify.delete('/categories/:id', {
    preHandler: requireAdmin
  }, deleteCategory);
}

export default categoryRoutes;