import DeliveryBoy from '../models/DeliveryBoy.js';
import Order from '../models/Order.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load wards data
let wardsList = [];
try {
  const wardFilePath = path.join(__dirname, '../data/Karaikudi_Wards.json');
  if (fs.existsSync(wardFilePath)) {
    const wardsData = JSON.parse(fs.readFileSync(wardFilePath, 'utf8'));
    wardsList = wardsData.wards || [];
    console.log(`✅ Loaded ${wardsList.length} wards for admin delivery`);
  } else {
    console.warn('⚠️ Karaikudi_Wards.json not found');
  }
} catch (error) {
  console.error('Error loading wards:', error.message);
}

// Helper: Get ward names from ward IDs
const getWardNames = (wardIds, wards) => {
  if (!wardIds || !wardIds.length) return [];
  return wardIds.map(id => {
    const ward = wards.find(w => w.wardId === id);
    return ward ? ward.wardName : `Ward ${id}`;
  });
};

// Get all delivery boys
export const getAllDeliveryBoys = async (request, reply) => {
  try {
    const deliveryBoys = await DeliveryBoy.find().sort({ createdAt: -1 });
    return reply.status(200).send({ 
      success: true, 
      count: deliveryBoys.length,
      deliveryBoys 
    });
  } catch (error) {
    console.error('Get all delivery boys error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get single delivery boy by ID
export const getDeliveryBoyById = async (request, reply) => {
  try {
    const { id } = request.params;
    const deliveryBoy = await DeliveryBoy.findById(id).select('-password');
    
    if (!deliveryBoy) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Delivery boy not found' 
      });
    }
    
    return reply.status(200).send({ 
      success: true, 
      deliveryBoy 
    });
  } catch (error) {
    console.error('Get delivery boy error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Add new delivery boy
export const addDeliveryBoy = async (request, reply) => {
  try {
    const { name, email, phone, password, wardIds, vehicleType, vehicleNumber } = request.body;
    
    // Validation
    if (!name || !email || !phone || !password || !wardIds || !wardIds.length) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Name, email, phone, password and at least one ward are required' 
      });
    }
    
    // Check if phone or email already exists
    const existing = await DeliveryBoy.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Phone number or email already exists' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Get ward names from IDs
    const wardNames = getWardNames(wardIds, wardsList);
    
    const deliveryBoy = new DeliveryBoy({
      name,
      email,
      phone,
      password: hashedPassword,
      wardIds: wardIds.map(id => parseInt(id)),
      wardNames: wardNames,
      vehicleType: vehicleType || 'bike',
      vehicleNumber: vehicleNumber || '',
      status: 'active',
      isVerified: true
    });
    
    await deliveryBoy.save();
    
    return reply.status(201).send({ 
      success: true, 
      message: 'Delivery boy added successfully',
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        wardIds: deliveryBoy.wardIds,
        wardNames: deliveryBoy.wardNames
      }
    });
  } catch (error) {
    console.error('Add delivery boy error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update delivery boy
export const updateDeliveryBoy = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name, email, phone, wardIds, vehicleType, vehicleNumber, status, password } = request.body;
    
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Delivery boy not found' 
      });
    }
    
    // Update fields
    if (name) deliveryBoy.name = name;
    if (email) deliveryBoy.email = email;
    if (phone) deliveryBoy.phone = phone;
    if (wardIds && wardIds.length) {
      deliveryBoy.wardIds = wardIds.map(id => parseInt(id));
      deliveryBoy.wardNames = getWardNames(deliveryBoy.wardIds, wardsList);
    }
    if (vehicleType) deliveryBoy.vehicleType = vehicleType;
    if (vehicleNumber) deliveryBoy.vehicleNumber = vehicleNumber;
    if (status) deliveryBoy.status = status;
    if (password) {
      deliveryBoy.password = await bcrypt.hash(password, 10);
    }
    
    await deliveryBoy.save();
    
    return reply.status(200).send({ 
      success: true, 
      message: 'Delivery boy updated successfully',
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        wardIds: deliveryBoy.wardIds,
        wardNames: deliveryBoy.wardNames,
        status: deliveryBoy.status
      }
    });
  } catch (error) {
    console.error('Update delivery boy error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Delete delivery boy
export const deleteDeliveryBoy = async (request, reply) => {
  try {
    const { id } = request.params;
    
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Delivery boy not found' 
      });
    }
    
    // Check if delivery boy has any assigned orders
    const assignedOrders = await Order.countDocuments({ 
      deliveryBoy: id, 
      deliveryStatus: { $in: ['assigned', 'picked_up'] } 
    });
    
    if (assignedOrders > 0) {
      return reply.status(400).send({ 
        success: false, 
        message: `Cannot delete. Delivery boy has ${assignedOrders} pending deliveries.` 
      });
    }
    
    await DeliveryBoy.findByIdAndDelete(id);
    
    return reply.status(200).send({ 
      success: true, 
      message: 'Delivery boy deleted successfully' 
    });
  } catch (error) {
    console.error('Delete delivery boy error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get wards list for dropdown
export const getWardsList = async (request, reply) => {
  try {
    return reply.status(200).send({ 
      success: true, 
      wards: wardsList 
    });
  } catch (error) {
    console.error('Get wards list error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get unassigned orders (for admin to view)
export const getUnassignedOrders = async (request, reply) => {
  try {
    const unassignedOrders = await Order.find({ 
      deliveryStatus: 'unassigned',
      orderStatus: { $in: ['confirmed', 'processing'] }
    }).sort({ createdAt: 1 }).limit(50);
    
    return reply.status(200).send({ 
      success: true, 
      count: unassignedOrders.length,
      orders: unassignedOrders 
    });
  } catch (error) {
    console.error('Get unassigned orders error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Manually assign order to delivery boy
export const assignOrderToDeliveryBoy = async (request, reply) => {
  try {
    const { orderId, deliveryBoyId } = request.body;
    
    const order = await Order.findById(orderId);
    if (!order) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Delivery boy not found' 
      });
    }
    
    if (deliveryBoy.status !== 'active') {
      return reply.status(400).send({ 
        success: false, 
        message: 'Delivery boy is not active' 
      });
    }
    
    order.deliveryBoy = deliveryBoyId;
    order.deliveryStatus = 'assigned';
    order.deliveryAssignedAt = new Date();
    await order.save();
    
    return reply.status(200).send({ 
      success: true, 
      message: `Order assigned to ${deliveryBoy.name} successfully`,
      order: {
        _id: order._id,
        orderId: order.orderId,
        deliveryStatus: order.deliveryStatus,
        deliveryBoy: {
          id: deliveryBoy._id,
          name: deliveryBoy.name,
          phone: deliveryBoy.phone
        }
      }
    });
  } catch (error) {
    console.error('Assign order error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};
export const getDeliveryBoyStats = async (request, reply) => {
  try {
    const { id } = request.params;
    
    console.log(`📊 Fetching stats for delivery boy ID: ${id}`);
    
    // Find delivery boy
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      console.log(`❌ Delivery boy not found: ${id}`);
      return reply.status(404).send({
        success: false,
        message: 'Delivery boy not found'
      });
    }
    
    // ✅ LOG THE ACTUAL DATA FROM DATABASE
    console.log('✅ Delivery boy from DB:', {
      id: deliveryBoy._id,
      name: deliveryBoy.name,
      phone: deliveryBoy.phone,
      email: deliveryBoy.email,
      status: deliveryBoy.status,
      wardIds: deliveryBoy.wardIds,
      wardNames: deliveryBoy.wardNames,
      totalDeliveries: deliveryBoy.totalDeliveries,
      totalEarnings: deliveryBoy.totalEarnings,
      createdAt: deliveryBoy.createdAt
    });
    
    // Get ALL orders assigned to this delivery boy
    const allOrders = await Order.find({ 
      deliveryBoy: id 
    }).sort({ createdAt: -1 });
    
    console.log(`📦 Total orders found: ${allOrders.length}`);
    
    // Calculate statistics
    const totalOrders = allOrders.length;
    const deliveredOrders = allOrders.filter(o => o.deliveryStatus === 'delivered').length;
    const cancelledOrders = allOrders.filter(o => o.orderStatus === 'cancelled').length;
    const pendingOrders = allOrders.filter(o => 
      (o.deliveryStatus === 'assigned' || o.deliveryStatus === 'picked_up') && 
      o.orderStatus !== 'cancelled'
    ).length;
    
    // Recent orders
    const recentOrders = allOrders.slice(0, 10);
    
    // ✅ MAKE SURE TO RETURN ACTUAL DATABASE VALUES, NOT DEFAULTS
    return reply.status(200).send({
      success: true,
      stats: {
        totalOrders,
        deliveredOrders,
        cancelledOrders,
        pendingOrders,
        totalEarnings: deliveryBoy.totalEarnings || 0
      },
      monthlyStats: [],
      recentOrders,
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,  // Should be "Ajay"
        email: deliveryBoy.email,  // Should be "Ajay1@example.com"
        phone: deliveryBoy.phone,  // Should be "7092514027"
        wardIds: deliveryBoy.wardIds || [],  // Should be [1, 2]
        wardNames: deliveryBoy.wardNames || [],  // Should be ward names
        vehicleType: deliveryBoy.vehicleType || 'Not specified',
        vehicleNumber: deliveryBoy.vehicleNumber || '',
        status: deliveryBoy.status || 'inactive',  // Should be "active"
        totalDeliveries: deliveryBoy.totalDeliveries || 0,
        totalEarnings: deliveryBoy.totalEarnings || 0,
        joinedAt: deliveryBoy.createdAt  // Should have a date
      }
    });
    
  } catch (error) {
    console.error('❌ Get delivery boy stats error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Get delivery boy's orders with filters
export const getDeliveryBoyOrders = async (request, reply) => {
  try {
    const { id } = request.params;
    const { status, page = 1, limit = 20 } = request.query;
    
    console.log(`📋 Fetching orders for delivery boy: ${id}, filter: ${status || 'all'}`);
    
    const filter = { deliveryBoy: id };
    
    if (status && status !== 'all') {
      if (status === 'delivered') {
        filter.deliveryStatus = 'delivered';
      } else if (status === 'cancelled') {
        filter.orderStatus = 'cancelled';
      } else if (status === 'pending') {
        filter.deliveryStatus = { $in: ['assigned', 'picked_up'] };
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalOrders = await Order.countDocuments(filter);
    
    console.log(`✅ Found ${totalOrders} orders for delivery boy`);
    
    return reply.status(200).send({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        totalOrders,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Get delivery boy orders error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};