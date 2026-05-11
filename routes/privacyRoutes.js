import {
  getPrivacy,
  getPrivacyByVersion,
  getAllVersions,
  createOrUpdatePrivacy,
  updateSection,
  updateDataCollection,
  deletePrivacy,
  hardDeletePrivacy
} from '../controllers/privacyController.js';

async function privacyRoutes(fastify, options) {
  // Public routes
  fastify.get('/privacy', getPrivacy);
  fastify.get('/privacy/version/:version', getPrivacyByVersion);
  
  // Admin/Protected routes
  fastify.get('/privacy/admin/versions', getAllVersions);
  fastify.post('/privacy', createOrUpdatePrivacy);
  fastify.put('/privacy/section/:sectionNumber', updateSection);
  fastify.put('/privacy/data-collection', updateDataCollection);
  fastify.delete('/privacy/:id', deletePrivacy);
  fastify.delete('/privacy/hard/:id', hardDeletePrivacy);
}

export default privacyRoutes;