import {
  getTerms,
  getTermsByVersion,
  getAllVersions,
  createOrUpdateTerms,
  updateSection,
  updateRequirements,
  deleteTerms,
  hardDeleteTerms
} from '../controllers/termsController.js';

async function termsRoutes(fastify, options) {
  // Public routes
  fastify.get('/terms', getTerms);
  fastify.get('/terms/version/:version', getTermsByVersion);
  
  // Admin/Protected routes
  fastify.get('/terms/admin/versions', getAllVersions);
  fastify.post('/terms', createOrUpdateTerms);
  fastify.put('/terms/section/:sectionNumber', updateSection);
  fastify.put('/terms/requirements', updateRequirements);
  fastify.delete('/terms/:id', deleteTerms);
  fastify.delete('/terms/hard/:id', hardDeleteTerms);
}

export default termsRoutes;