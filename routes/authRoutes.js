import {
  sendOtp,
  sendSignupOtp,
  verifyOtp,
  createAdmin,
  adminLogin,
  logout,
  getProfile,
  adminDashboard,
  requireAdmin,
  requireAuth,
  requireStrictAuth
} from '../controllers/authController.js';

async function authRoutes(fastify, options) {
  
  // ✅ User OTP routes - REMOVE /auth prefix since it's already in app.js
  fastify.post('/send-otp', {
    handler: sendOtp
  });
  
  fastify.post('/send-signup-otp', {
    handler: sendSignupOtp
  });
  
  fastify.post('/verify-otp', {
    handler: verifyOtp
  });
  
  // Admin routes
  fastify.post('/create-admin', {
    handler: createAdmin
  });
  
  fastify.post('/admin-login', {
    handler: adminLogin
  });
  
  // Common routes
  fastify.post('/logout', {
    preHandler: [requireAuth],
    handler: logout
  });
  
  fastify.get('/profile', {
    preHandler: [requireAuth],
    handler: getProfile
  });
  
  // Admin dashboard
  fastify.get('/dashboard', {
    preHandler: [requireAdmin],
    handler: adminDashboard
  });
}

export default authRoutes;