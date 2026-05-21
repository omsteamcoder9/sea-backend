import DeliveryBoy from '../models/DeliveryBoy.js';
import Order from '../models/Order.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Delivery Boy Login
export const deliveryLogin = async (request, reply) => {
  try {
    const { phone, password } = request.body;
    
    if (!phone || !password) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Phone and password are required' 
      });
    }
    
    const deliveryBoy = await DeliveryBoy.findOne({ phone });
    if (!deliveryBoy) {
      return reply.status(401).send({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    if (deliveryBoy.status !== 'active') {
      return reply.status(401).send({ 
        success: false, 
        message: 'Your account is inactive. Please contact admin.' 
      });
    }
    
    const isPasswordValid = await bcrypt.compare(password, deliveryBoy.password);
    if (!isPasswordValid) {
      return reply.status(401).send({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    const token = jwt.sign(
      { id: deliveryBoy._id, role: 'delivery_boy', phone: deliveryBoy.phone },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return reply.status(200).send({
      success: true,
      message: 'Login successful',
      token,
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        wardId: deliveryBoy.wardId,
        wardName: deliveryBoy.wardName,
        vehicleType: deliveryBoy.vehicleType,
        totalDeliveries: deliveryBoy.totalDeliveries,
        totalEarnings: deliveryBoy.totalEarnings
      }
    });
  } catch (error) {
    console.error('Delivery login error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get delivery boy's current assigned orders
export const getMyOrders = async (request, reply) => {
  try {
    const deliveryBoyId = request.user.id;
    
    const orders = await Order.find({ 
      deliveryBoy: deliveryBoyId,
      deliveryStatus: { $in: ['assigned', 'picked_up'] }
    }).sort({ createdAt: -1 });
    
    return reply.status(200).send({ 
      success: true, 
      count: orders.length,
      orders 
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get delivery order history (delivered orders)
export const getOrderHistory = async (request, reply) => {
  try {
    const deliveryBoyId = request.user.id;
    
    const orders = await Order.find({ 
      deliveryBoy: deliveryBoyId,
      deliveryStatus: 'delivered'
    }).sort({ deliveryDeliveredAt: -1 }).limit(50);
    
    return reply.status(200).send({ 
      success: true, 
      count: orders.length,
      orders 
    });
  } catch (error) {
    console.error('Get order history error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get single order details
export const getOrderDetails = async (request, reply) => {
  try {
    const { orderId } = request.params;
    const deliveryBoyId = request.user.id;
    
    const order = await Order.findOne({ 
      _id: orderId, 
      deliveryBoy: deliveryBoyId 
    }).populate('products.product', 'name images');
    
    if (!order) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    return reply.status(200).send({ 
      success: true, 
      order 
    });
  } catch (error) {
    console.error('Get order details error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Mark order as picked up
export const markPickedUp = async (request, reply) => {
  try {
    const { orderId } = request.params;
    const deliveryBoyId = request.user.id;
    
    const order = await Order.findOne({ 
      _id: orderId, 
      deliveryBoy: deliveryBoyId,
      deliveryStatus: 'assigned'
    });
    
    if (!order) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Order not found or already picked up' 
      });
    }
    
    order.deliveryStatus = 'picked_up';
    order.deliveryPickedUpAt = new Date();
    await order.save();
    
    return reply.status(200).send({ 
      success: true, 
      message: 'Order marked as picked up',
      order: {
        _id: order._id,
        orderId: order.orderId,
        deliveryStatus: order.deliveryStatus,
        deliveryPickedUpAt: order.deliveryPickedUpAt
      }
    });
  } catch (error) {
    console.error('Mark picked up error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Mark order as delivered
export const markDelivered = async (request, reply) => {
  try {
    const { orderId } = request.params;
    const deliveryBoyId = request.user.id;
    
    const order = await Order.findOne({ 
      _id: orderId, 
      deliveryBoy: deliveryBoyId,
      deliveryStatus: 'picked_up'
    });
    
    if (!order) {
      return reply.status(404).send({ 
        success: false, 
        message: 'Order not found or not picked up yet' 
      });
    }
    
    order.deliveryStatus = 'delivered';
    order.deliveryDeliveredAt = new Date();
    order.orderStatus = 'delivered';
    order.deliveredAt = new Date();
    await order.save();
    
    // Update delivery boy stats
    await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, {
      $inc: { totalDeliveries: 1 }
    });
    
    return reply.status(200).send({ 
      success: true, 
      message: 'Order delivered successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        deliveryStatus: order.deliveryStatus,
        deliveryDeliveredAt: order.deliveryDeliveredAt
      }
    });
  } catch (error) {
    console.error('Mark delivered error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get delivery boy profile
export const getProfile = async (request, reply) => {
  try {
    const deliveryBoy = await DeliveryBoy.findById(request.user.id).select('-password');
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
    console.error('Get profile error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update delivery boy profile
export const updateProfile = async (request, reply) => {
  try {
    const deliveryBoyId = request.user.id;
    const { vehicleType, vehicleNumber, password } = request.body;
    
    const updateData = {};
    if (vehicleType) updateData.vehicleType = vehicleType;
    if (vehicleNumber) updateData.vehicleNumber = vehicleNumber;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      deliveryBoyId, 
      updateData, 
      { new: true }
    ).select('-password');
    
    return reply.status(200).send({ 
      success: true, 
      message: 'Profile updated successfully',
      deliveryBoy 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get delivery stats (dashboard)
export const getStats = async (request, reply) => {
  try {
    const deliveryBoyId = request.user.id;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = await Order.countDocuments({
      deliveryBoy: deliveryBoyId,
      deliveryDeliveredAt: { $gte: today }
    });
    
    const pendingOrders = await Order.countDocuments({
      deliveryBoy: deliveryBoyId,
      deliveryStatus: { $in: ['assigned', 'picked_up'] }
    });
    
    const totalDelivered = await Order.countDocuments({
      deliveryBoy: deliveryBoyId,
      deliveryStatus: 'delivered'
    });
    
    return reply.status(200).send({
      success: true,
      stats: {
        todayDeliveries: todayOrders,
        pendingOrders: pendingOrders,
        totalDeliveries: totalDelivered
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: error.message 
    });
  }
};