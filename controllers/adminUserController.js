// controllers/adminUserController.js
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// 📋 Get all users with pagination, filtering, and sorting
export const getAllUsers = async (request, reply) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
      isActive = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = request.query;

    // Build filter object
    let filter = {};
    
    // Role filter
    if (role && role !== 'all') {
      filter.role = role;
    }
    
    // Active status filter
    if (isActive !== '') {
      filter.isActive = isActive === 'true';
    }
    
    // Search filter (by name, phoneNumber, or email)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination calculations
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute queries in parallel
    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter)
    ]);
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    return reply.status(200).send({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      },
      message: 'Users retrieved successfully'
    });
    
  } catch (error) {
    console.error(' Get all users error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// 👤 Get single user by ID
export const getUserById = async (request, reply) => {
  try {
    const { id } = request.params;
    
    const user = await User.findById(id).lean();
    
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }
    
    return reply.status(200).send({
      success: true,
      data: user,
      message: 'User retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Get user by ID error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

// ✏️ Update user
export const updateUser = async (request, reply) => {
  try {
    const { id } = request.params;
    const updateData = request.body;
    
    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prepare update object
    const updates = {};
    
    // Update allowed fields
    const allowedFields = ['name', 'role', 'isActive', 'phoneNumber', 'email'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });
    
    // Handle password update separately
    if (updateData.password && updateData.password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updateData.password, salt);
    }
    
    // Handle unique field conflicts
    if (updateData.phoneNumber && updateData.phoneNumber !== existingUser.phoneNumber) {
      const phoneExists = await User.findOne({ 
        phoneNumber: updateData.phoneNumber,
        _id: { $ne: id }
      });
      if (phoneExists) {
        return reply.status(400).send({
          success: false,
          message: 'Phone number already in use by another user'
        });
      }
      updates.phoneNumber = updateData.phoneNumber;
    }
    
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await User.findOne({ 
        email: updateData.email,
        _id: { $ne: id }
      });
      if (emailExists) {
        return reply.status(400).send({
          success: false,
          message: 'Email already in use by another user'
        });
      }
      updates.email = updateData.email;
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
    
    return reply.status(200).send({
      success: true,
      data: updatedUser,
      message: 'User updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Update user error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return reply.status(400).send({
        success: false,
        message: `${field} already exists. Please use a different ${field}`
      });
    }
    
    return reply.status(500).send({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

// 🗑️ Delete user (soft delete or hard delete)
export const deleteUser = async (request, reply) => {
  try {
    const { id } = request.params;
    const { permanent = false } = request.query;
    
    const user = await User.findById(id);
    
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prevent deleting last admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (adminCount === 1) {
        return reply.status(400).send({
          success: false,
          message: 'Cannot delete the last admin user'
        });
      }
    }
    
    if (permanent === 'true' || permanent === true) {
      // Permanent delete
      await User.findByIdAndDelete(id);
      return reply.status(200).send({
        success: true,
        message: 'User permanently deleted successfully'
      });
    } else {
      // Soft delete (deactivate)
      await User.findByIdAndUpdate(id, { isActive: false });
      return reply.status(200).send({
        success: true,
        message: 'User deactivated successfully'
      });
    }
    
  } catch (error) {
    console.error('❌ Delete user error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

// 🔄 Restore soft-deleted user
export const restoreUser = async (request, reply) => {
  try {
    const { id } = request.params;
    
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    ).lean();
    
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: 'User not found'
      });
    }
    
    return reply.status(200).send({
      success: true,
      data: user,
      message: 'User restored successfully'
    });
    
  } catch (error) {
    console.error('❌ Restore user error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error restoring user',
      error: error.message
    });
  }
};

// 📊 Get user statistics summary
export const getUserStatsSummary = async (request, reply) => {
  try {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminUsers,
      regularUsers,
      recentUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'user' }),
      User.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email phoneNumber role createdAt isActive')
        .lean()
    ]);
    
    // Get registration trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const registrationTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return reply.status(200).send({
      success: true,
      data: {
        totals: {
          totalUsers,
          activeUsers,
          inactiveUsers,
          adminUsers,
          regularUsers
        },
        recentUsers,
        registrationTrend,
        activePercentage: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(2) : 0
      },
      message: 'User statistics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ User stats error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching user statistics',
      error: error.message
    });
  }
};

// 👑 Create admin user
export const createAdminUser = async (request, reply) => {
  try {
    const { email, password, name, phoneNumber } = request.body;
    
    // Validate required fields
    if (!email || !password || !name) {
      return reply.status(400).send({
        success: false,
        message: 'Email, password, and name are required'
      });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return reply.status(400).send({
        success: false,
        message: 'Email already in use'
      });
    }
    
    // Check if phone number already exists (if provided)
    if (phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone) {
        return reply.status(400).send({
          success: false,
          message: 'Phone number already in use'
        });
      }
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create admin user
    const newAdmin = await User.create({
      email,
      password: hashedPassword,
      name,
      phoneNumber: phoneNumber || null,
      role: 'admin',
      isActive: true
    });
    
    // Remove password from response
    const adminResponse = newAdmin.toObject();
    delete adminResponse.password;
    
    return reply.status(201).send({
      success: true,
      data: adminResponse,
      message: 'Admin user created successfully'
    });
    
  } catch (error) {
    console.error('❌ Create admin error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error creating admin user',
      error: error.message
    });
  }
};

// 🧹 Bulk actions
export const bulkUserAction = async (request, reply) => {
  try {
    const { userIds, action } = request.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return reply.status(400).send({
        success: false,
        message: 'Please provide an array of user IDs'
      });
    }
    
    let result;
    
    switch (action) {
      case 'activate':
        result = await User.updateMany(
          { _id: { $in: userIds } },
          { isActive: true }
        );
        break;
        
      case 'deactivate':
        // Prevent deactivating last admin
        const adminUsers = await User.find({ 
          _id: { $in: userIds },
          role: 'admin'
        });
        
        if (adminUsers.length > 0) {
          const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
          if (adminCount === adminUsers.length) {
            return reply.status(400).send({
              success: false,
              message: 'Cannot deactivate all admin users'
            });
          }
        }
        
        result = await User.updateMany(
          { _id: { $in: userIds } },
          { isActive: false }
        );
        break;
        
      case 'delete':
        // Prevent deleting last admin
        const adminsToDelete = await User.find({ 
          _id: { $in: userIds },
          role: 'admin'
        });
        
        if (adminsToDelete.length > 0) {
          const adminCount = await User.countDocuments({ role: 'admin' });
          if (adminCount === adminsToDelete.length) {
            return reply.status(400).send({
              success: false,
              message: 'Cannot delete all admin users'
            });
          }
        }
        
        result = await User.deleteMany({ _id: { $in: userIds } });
        break;
        
      default:
        return reply.status(400).send({
          success: false,
          message: 'Invalid action. Use: activate, deactivate, or delete'
        });
    }
    
    return reply.status(200).send({
      success: true,
      data: {
        modifiedCount: result.modifiedCount || result.deletedCount,
        action
      },
      message: `Bulk ${action} completed successfully`
    });
    
  } catch (error) {
    console.error('❌ Bulk action error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error performing bulk action',
      error: error.message
    });
  }
};