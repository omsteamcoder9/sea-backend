import {
  getSettings,
  updateSettings,
  getPublicSettings
} from '../controllers/settingsController.js';
import { requireAdmin } from '../controllers/authController.js';

async function settingsRoutes(fastify, options) {
  
  // Get all settings (Admin only)
  fastify.get('/admin/settings', { preHandler: requireAdmin }, getSettings);
  
  // Update settings (Admin only)
  fastify.put('/admin/settings', { preHandler: requireAdmin }, updateSettings);
  
  // Get public settings (Public - no auth)
  fastify.get('/settings/public', getPublicSettings);
}

export default settingsRoutes;