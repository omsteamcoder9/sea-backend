// routes/statsRoutes.js
import {
  getComprehensiveStats,
  getDashboardStats,
  getSalesAnalytics,
  getUserAnalytics
} from '../controllers/statsController.js';

async function statsRoutes(fastify, options) {
  
  fastify.get('/stats', {
    handler: getComprehensiveStats
  });
  
  fastify.get('/stats/dashboard', {
    handler: getDashboardStats
  });
  
  fastify.get('/stats/sales-analytics', {
    handler: getSalesAnalytics
  });
  
  fastify.get('/stats/user-analytics', {
    handler: getUserAnalytics
  });
}

export default statsRoutes;