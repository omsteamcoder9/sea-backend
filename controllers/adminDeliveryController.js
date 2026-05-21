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
    const { name, email, phone, password, wardId, wardName, vehicleType, vehicleNumber } = request.body;
    
    // Validation
    if (!name || !email || !phone || !password || !wardId) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Name, email, phone, password and ward are required' 
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
    
    const deliveryBoy = new DeliveryBoy({
      name,
      email,
      phone,
      password: hashedPassword,
      wardId: parseInt(wardId),
      wardName: wardName || `Ward ${wardId}`,
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
        wardId: deliveryBoy.wardId,
        wardName: deliveryBoy.wardName
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
    const { name, email, phone, wardId, wardName, vehicleType, vehicleNumber, status, password } = request.body;
    
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
    if (wardId) deliveryBoy.wardId = parseInt(wardId);
    if (wardName) deliveryBoy.wardName = wardName;
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
        wardId: deliveryBoy.wardId,
        wardName: deliveryBoy.wardName,
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

// Get delivery boy stats for admin dashboard
export const getDeliveryBoyStats = async (request, reply) => {
  try {
    const totalBoys = await DeliveryBoy.countDocuments();
    const activeBoys = await DeliveryBoy.countDocuments({ status: 'active' });
    const inactiveBoys = await DeliveryBoy.countDocuments({ status: 'inactive' });
    
    const totalDeliveries = await Order.countDocuments({ deliveryStatus: 'delivered' });
    
    return reply.status(200).send({
      success: true,
      stats: {
        totalBoys,
        activeBoys,
        inactiveBoys,
        totalDeliveries
      }
    });
  } catch (error) {
    console.error('Get delivery boy stats error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};