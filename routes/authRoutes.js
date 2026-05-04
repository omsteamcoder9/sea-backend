import { 
  sendOtp, 
  verifyOtp, 
  logout, 
  getProfile,
  createAdmin,
  adminLogin,
  adminDashboard
} from '../controllers/authController.js';

async function authRoutes(fastify, options) {
  
  // ============ USER ROUTES (OTP Based) ============
  
  // Send OTP (for user login/signup)
  fastify.post('/send-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: { type: 'string', minLength: 10, maxLength: 15 }
        }
      }
    }
  }, sendOtp);
  
  // Verify OTP and login/signup for user
  fastify.post('/verify-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['otpSessionId', 'otpCode'],
        properties: {
          otpSessionId: { type: 'string' },
          otpCode: { type: 'string', minLength: 4, maxLength: 6 }
        }
      }
    }
  }, verifyOtp);
  
  // ============ ADMIN ROUTES (Email/Password Based) ============
  
  // Create admin account (can be restricted or removed after first admin)
  fastify.post('/admin/create', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          name: { type: 'string' }
        }
      }
    }
  }, createAdmin);
  
  // Admin login (email + password)
  fastify.post('/admin/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, adminLogin);
  
  // Admin protected routes
  fastify.get('/admin/dashboard', adminDashboard);
  
  // ============ COMMON ROUTES ============
  
  // Logout (both admin and user)
  fastify.post('/logout', logout);
  
  // Get profile (protected route - works for both)
  fastify.get('/profile', getProfile);
}

export default authRoutes;