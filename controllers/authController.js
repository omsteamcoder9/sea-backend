import User from '../models/User.js';
import { sendOTP, verifyOTP } from '../utils/twoFactorClient.js';
import bcrypt from 'bcryptjs';

// Store OTP sessions temporarily (in production, use Redis)
const otpSessions = new Map();

// ============ USER (OTP) AUTH ============

// Send OTP for user login/signup
export const sendOtp = async (request, reply) => {
  try {
    const { phoneNumber } = request.body;
    
    if (!phoneNumber) {
      return reply.status(400).send({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Check if user exists and is ACTIVE
    const existingUser = await User.findOne({ 
      phoneNumber,
      isActive: true
    });
    
    // Check if there's an inactive user with this phone number
    const inactiveUser = await User.findOne({ 
      phoneNumber,
      isActive: false 
    });
    
    const isNewUser = !existingUser;
    const hasInactiveUser = !!inactiveUser;
    
    // Send OTP via 2factor
    const otpResult = await sendOTP(phoneNumber);
    
    if (!otpResult.success) {
      return reply.status(500).send({
        success: false,
        message: otpResult.message
      });
    }
    
    // Store OTP session info
    otpSessions.set(otpResult.otpSessionId, {
      phoneNumber,
      isNewUser,
      hasInactiveUser,
      role: 'user',
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
    });
    
    // Auto-cleanup expired sessions
    setTimeout(() => {
      if (otpSessions.has(otpResult.otpSessionId)) {
        otpSessions.delete(otpResult.otpSessionId);
      }
    }, 10 * 60 * 1000);
    
    return reply.status(200).send({
      success: true,
      message: 'OTP sent successfully',
      otpSessionId: otpResult.otpSessionId,
      isNewUser
    });
    
  } catch (error) {
    console.error('Send OTP error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify OTP and login/signup for user
export const verifyOtp = async (request, reply) => {
  try {
    const { otpSessionId, otpCode } = request.body;
    
    if (!otpSessionId || !otpCode) {
      return reply.status(400).send({
        success: false,
        message: 'OTP Session ID and OTP code are required'
      });
    }
    
    // Check if session exists
    const session = otpSessions.get(otpSessionId);
    if (!session) {
      return reply.status(400).send({
        success: false,
        message: 'OTP session expired or invalid'
      });
    }
    
    // Check session expiry
    if (Date.now() > session.expiresAt) {
      otpSessions.delete(otpSessionId);
      return reply.status(400).send({
        success: false,
        message: 'OTP session expired'
      });
    }
    
    // Verify OTP with 2factor
    const verifyResult = await verifyOTP(otpSessionId, otpCode);
    
    if (!verifyResult.success) {
      return reply.status(400).send({
        success: false,
        message: verifyResult.message
      });
    }
    
    let user;
    const { phoneNumber, isNewUser, hasInactiveUser } = session;
    
    if (isNewUser && !hasInactiveUser) {
      // NEW user - create account
      user = await User.create({
        phoneNumber,
        role: 'user',
        isActive: true,
        lastLogin: new Date()
      });
    } else if (hasInactiveUser) {
      // EXISTING but INACTIVE user - REACTIVATE
      user = await User.findOneAndUpdate(
        { phoneNumber },
        { 
          isActive: true,
          lastLogin: new Date()
        },
        { new: true }
      );
    } else {
      // ACTIVE existing user - just update login
      user = await User.findOneAndUpdate(
        { phoneNumber },
        { lastLogin: new Date() },
        { new: true }
      );
    }
    
    // Clear OTP session
    otpSessions.delete(otpSessionId);
    
    // Generate JWT token
    const token = request.server.jwt.sign({
      userId: user._id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      role: user.role
    });
    
    return reply.status(200).send({
      success: true,
      message: hasInactiveUser ? 'Account reactivated successfully' : 
               isNewUser ? 'Account created successfully' : 'Login successful',
      token,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        name: user.name,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
    
  } catch (error) {
    console.error('Verify OTP error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ============ ADMIN AUTH ============

// Create first admin (run this once or provide a way to create admin)
export const createAdmin = async (request, reply) => {
  try {
    const { email, password, name } = request.body;
    
    if (!email || !password) {
      return reply.status(400).send({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return reply.status(400).send({
        success: false,
        message: 'Admin with this email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin user
    const admin = await User.create({
      email,
      password: hashedPassword,
      role: 'admin',
      name: name || 'Admin',
      isActive: true,
      lastLogin: new Date()
    });
    
    // Generate JWT token
    const token = request.server.jwt.sign({
      userId: admin._id,
      email: admin.email,
      role: admin.role
    });
    
    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;
    
    return reply.status(201).send({
      success: true,
      message: 'Admin account created successfully',
      token,
      user: adminResponse
    });
    
  } catch (error) {
    console.error('Create admin error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Admin login with email and password
export const adminLogin = async (request, reply) => {
  try {
    const { email, password } = request.body;
    
    if (!email || !password) {
      return reply.status(400).send({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find admin by email with password field
    const admin = await User.findOne({ 
      email, 
      role: 'admin',
      isActive: true // Only allow active admins to login
    }).select('+password');
    
    if (!admin) {
      return reply.status(401).send({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    
    if (!isPasswordValid) {
      return reply.status(401).send({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Update last login
    admin.lastLogin = new Date();
    await admin.save();
    
    // Generate JWT token
    const token = request.server.jwt.sign({
      userId: admin._id,
      email: admin.email,
      role: admin.role
    });
    
    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;
    
    return reply.status(200).send({
      success: true,
      message: 'Admin login successful',
      token,
      user: adminResponse
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ============ COMMON AUTH ============

// Logout user
export const logout = async (request, reply) => {
  try {
    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get current user profile (works for both admin and user)
export const getProfile = async (request, reply) => {
  try {
    await request.jwtVerify();
    
    const user = await User.findById(request.user.userId).select('-__v -password');
    
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }
    
    return reply.status(200).send({
      success: true,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        name: user.name,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
    
  } catch (error) {
    return reply.status(401).send({
      success: false,
      message: 'Unauthorized'
    });
  }
};

// ============ MIDDLEWARES ============

export const requireAdmin = async (request, reply) => {
  try {
    await request.jwtVerify();
    
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
  } catch (error) {
    return reply.status(401).send({
      success: false,
      message: 'Unauthorized'
    });
  }
};

// Example protected admin route
export const adminDashboard = async (request, reply) => {
  try {
    await request.jwtVerify();
    
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    // Get all users (admin only)
    const users = await User.find({}).select('-__v -password');
    const stats = {
      totalUsers: users.filter(u => u.role === 'user' && u.isActive).length,
      totalAdmins: users.filter(u => u.role === 'admin' && u.isActive).length,
      activeUsers: users.filter(u => u.isActive).length,
      inactiveUsers: users.filter(u => !u.isActive).length
    };
    
    return reply.status(200).send({
      success: true,
      users,
      stats
    });
    
  } catch (error) {
    return reply.status(401).send({
      success: false,
      message: 'Unauthorized'
    });
  }
};

// Middleware for authentication (optional - doesn't block guests)
export const requireAuth = async (request, reply) => {
  try {
    await request.jwtVerify();
    // User is authenticated, proceed
  } catch (error) {
    // User is not authenticated, but that's OK for guest carts
    // Set request.user to null and continue
    request.user = null;
  }
};

// Optional: Strict authentication (requires login)
export const requireStrictAuth = async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (error) {
    return reply.status(401).send({
      success: false,
      message: 'Authentication required'
    });
  }
};