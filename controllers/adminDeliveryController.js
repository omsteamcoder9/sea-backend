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

// Helper: Normalize areas array (trim, drop empties, remove duplicates)
const normalizeAreas = (areas) => {
  if (!Array.isArray(areas)) return [];
  const cleaned = areas
    .map(a => (typeof a === 'string' ? a.trim() : ''))
    .filter(a => a.length > 0);
  return [...new Set(cleaned)];
};

// ✅ Helper: Auto-assign unassigned orders to a delivery boy
const autoAssignOrdersToDeliveryBoy = async (deliveryBoy) => {
  try {
    if (!deliveryBoy || deliveryBoy.status !== 'active') {
      return { assignedCount: 0 };
    }

    const wardIds = (deliveryBoy.wardIds || []).map(id => parseInt(id));
    const areas = (deliveryBoy.areas || []).map(a => (a || '').trim().toLowerCase()).filter(Boolean);

    if (wardIds.length === 0 && areas.length === 0) {
      return { assignedCount: 0 };
    }

    // Find all unassigned, active orders
    const unassignedOrders = await Order.find({
      deliveryStatus: 'unassigned',
      orderStatus: { $in: ['confirmed', 'processing'] }
    });

    if (unassignedOrders.length === 0) {
      return { assignedCount: 0 };
    }

    let assignedCount = 0;
    const now = new Date();

    for (const order of unassignedOrders) {
      let matches = false;

      // Match by wardId
      if (!matches && order.wardId && wardIds.includes(order.wardId)) {
        matches = true;
      }

      // Match by typedArea or shippingAddress.city against boy's areas
      if (!matches && areas.length > 0) {
        const candidates = [
          (order.typedArea || '').trim().toLowerCase(),
          (order.shippingAddress?.city || '').trim().toLowerCase()
        ].filter(Boolean);

        if (candidates.some(c => areas.includes(c))) {
          matches = true;
        }
      }

      if (matches) {
        order.deliveryBoy = deliveryBoy._id;
        order.deliveryStatus = 'assigned';
        order.deliveryAssignedAt = now;
        await order.save();
        assignedCount++;
        console.log(`✅ Auto-assigned order ${order.orderId} to ${deliveryBoy.name}`);
      }
    }

    return { assignedCount };
  } catch (error) {
    console.error('❌ Auto-assign orders error:', error.message);
    return { assignedCount: 0, error: error.message };
  }
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
    const { name, email, phone, password, wardIds, areas, vehicleType, vehicleNumber } = request.body;
    
    const hasWards = Array.isArray(wardIds) && wardIds.length > 0;
    const hasAreas = Array.isArray(areas) && areas.length > 0;

    if (!name || !email || !phone || !password) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Name, email, phone and password are required' 
      });
    }

    if (!hasWards && !hasAreas) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Provide at least one ward or one area' 
      });
    }
    
    const existing = await DeliveryBoy.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Phone number or email already exists' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const normalizedWardIds = hasWards ? wardIds.map(id => parseInt(id)) : [];
    const wardNames = getWardNames(normalizedWardIds, wardsList);
    const normalizedAreas = normalizeAreas(areas);
    
    const deliveryBoy = new DeliveryBoy({
      name,
      email,
      phone,
      password: hashedPassword,
      wardIds: normalizedWardIds,
      wardNames: wardNames,
      areas: normalizedAreas,
      vehicleType: vehicleType || 'bike',
      vehicleNumber: vehicleNumber || '',
      status: 'active',
      isVerified: true
    });
    
    await deliveryBoy.save();

    // ✅ Auto-assign existing unassigned orders matching this new delivery boy
    const { assignedCount } = await autoAssignOrdersToDeliveryBoy(deliveryBoy);
    if (assignedCount > 0) {
      console.log(`🎯 Auto-assigned ${assignedCount} existing order(s) to ${deliveryBoy.name}`);
    }
    
    return reply.status(201).send({ 
      success: true, 
      message: assignedCount > 0
        ? `Delivery boy added successfully. ${assignedCount} existing order(s) auto-assigned.`
        : 'Delivery boy added successfully',
      autoAssignedCount: assignedCount,
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        wardIds: deliveryBoy.wardIds,
        wardNames: deliveryBoy.wardNames,
        areas: deliveryBoy.areas
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
    const { name, email, phone, wardIds, areas, vehicleType, vehicleNumber, status, password } = request.body;
    
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Delivery boy not found' 
      });
    }
    
    if (name) deliveryBoy.name = name;
    if (email) deliveryBoy.email = email;
    if (phone) deliveryBoy.phone = phone;
    if (wardIds !== undefined) {
      const normalizedWardIds = Array.isArray(wardIds) ? wardIds.map(id => parseInt(id)) : [];
      deliveryBoy.wardIds = normalizedWardIds;
      deliveryBoy.wardNames = getWardNames(normalizedWardIds, wardsList);
    }
    if (areas !== undefined) {
      deliveryBoy.areas = normalizeAreas(areas);
    }
    if (vehicleType) deliveryBoy.vehicleType = vehicleType;
    if (vehicleNumber) deliveryBoy.vehicleNumber = vehicleNumber;
    if (status) deliveryBoy.status = status;
    if (password) {
      deliveryBoy.password = await bcrypt.hash(password, 10);
    }
    
    await deliveryBoy.save();

    // ✅ Auto-assign existing unassigned orders (if boy is active)
    let assignedCount = 0;
    if (deliveryBoy.status === 'active') {
      const result = await autoAssignOrdersToDeliveryBoy(deliveryBoy);
      assignedCount = result.assignedCount;
      if (assignedCount > 0) {
        console.log(`🎯 Auto-assigned ${assignedCount} existing order(s) to ${deliveryBoy.name} (after update)`);
      }
    }
    
    return reply.status(200).send({ 
      success: true, 
      message: assignedCount > 0
        ? `Delivery boy updated successfully. ${assignedCount} existing order(s) auto-assigned.`
        : 'Delivery boy updated successfully',
      autoAssignedCount: assignedCount,
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        wardIds: deliveryBoy.wardIds,
        wardNames: deliveryBoy.wardNames,
        areas: deliveryBoy.areas,
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
    
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      console.log(`❌ Delivery boy not found: ${id}`);
      return reply.status(404).send({
        success: false,
        message: 'Delivery boy not found'
      });
    }
    
    console.log('✅ Delivery boy from DB:', {
      id: deliveryBoy._id,
      name: deliveryBoy.name,
      phone: deliveryBoy.phone,
      email: deliveryBoy.email,
      status: deliveryBoy.status,
      wardIds: deliveryBoy.wardIds,
      wardNames: deliveryBoy.wardNames,
      areas: deliveryBoy.areas,
      totalDeliveries: deliveryBoy.totalDeliveries,
      totalEarnings: deliveryBoy.totalEarnings,
      createdAt: deliveryBoy.createdAt
    });
    
    const allOrders = await Order.find({ 
      deliveryBoy: id 
    }).sort({ createdAt: -1 });
    
    console.log(`📦 Total orders found: ${allOrders.length}`);
    
    const totalOrders = allOrders.length;
    const deliveredOrders = allOrders.filter(o => o.deliveryStatus === 'delivered').length;
    const cancelledOrders = allOrders.filter(o => o.orderStatus === 'cancelled').length;
    const pendingOrders = allOrders.filter(o => 
      (o.deliveryStatus === 'assigned' || o.deliveryStatus === 'picked_up') && 
      o.orderStatus !== 'cancelled'
    ).length;
    
    const recentOrders = allOrders.slice(0, 10);
    
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
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        wardIds: deliveryBoy.wardIds || [],
        wardNames: deliveryBoy.wardNames || [],
        areas: deliveryBoy.areas || [],
        vehicleType: deliveryBoy.vehicleType || 'Not specified',
        vehicleNumber: deliveryBoy.vehicleNumber || '',
        status: deliveryBoy.status || 'inactive',
        totalDeliveries: deliveryBoy.totalDeliveries || 0,
        totalEarnings: deliveryBoy.totalEarnings || 0,
        joinedAt: deliveryBoy.createdAt
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