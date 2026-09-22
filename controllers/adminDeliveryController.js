import DeliveryBoy from '../models/DeliveryBoy.js';
import Order from '../models/Order.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// ✅ NORMALIZER
// ============================================================
const normalizeWard = (ward) => {
  const wardId = ward.wardId !== undefined ? ward.wardId : ward.ward_no;
  const wardName = ward.wardName !== undefined ? ward.wardName : ward.name;
  const streets = ward.streets !== undefined ? ward.streets : (ward.key_streets || []);
  let polygon = ward.polygon || [];
  if (polygon.length > 0 && typeof polygon[0] === 'object' && polygon[0].lat !== undefined) {
    polygon = polygon.map(p => [p.lat, p.lon]);
  }
  return { wardId, wardName, streets, polygon };
};

// ============================================================
// ✅ Load both cities' wards
// ============================================================
const citiesWards = new Map();

const loadCityWards = (cityKey, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Ward file not found for ${cityKey}`);
      return;
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const wards = (raw.wards || []).map(normalizeWard);
    citiesWards.set(cityKey, { city: cityKey, wards });
    console.log(`✅ Loaded ${wards.length} wards for "${cityKey}"`);
  } catch (error) {
    console.error(`❌ Error loading wards for ${cityKey}:`, error.message);
  }
};

loadCityWards('karaikudi', path.join(__dirname, '../data/Karaikudi_Wards.json'));
loadCityWards('pudukkottai', path.join(__dirname, '../data/Pudukkottai_Wards.json'));

// Flatten ward lookup by ID across cities (wardId might not be unique across cities)
const wardsById = new Map(); // wardId → [ward, ward, ...]
for (const [_, ctx] of citiesWards.entries()) {
  for (const w of ctx.wards) {
    const key = String(w.wardId);
    if (!wardsById.has(key)) wardsById.set(key, []);
    wardsById.get(key).push(w);
  }
}

// Get all wards across all cities (for getWardsList)
const getAllWards = () => {
  const out = [];
  for (const [_, ctx] of citiesWards.entries()) {
    out.push(...ctx.wards);
  }
  return out;
};

// ============================================================
// Helper: Get ward names from ward IDs (city-aware)
// ============================================================
const getWardNames = (wardIds, city) => {
  if (!wardIds || !wardIds.length) return [];

  const cityKey = (city || '').trim().toLowerCase();
  const ctx = cityKey ? citiesWards.get(cityKey) : null;

  return wardIds.map(id => {
    if (ctx) {
      const w = ctx.wards.find(x => String(x.wardId) === String(id));
      if (w) return w.wardName;
    }
    // fallback: any city (ambiguous) — only used if city not provided
    const arr = wardsById.get(String(id));
    return arr && arr.length > 0 ? arr[0].wardName : `Ward ${id}`;
  });
};

// Helper: Normalize areas array
const normalizeAreas = (areas) => {
  if (!Array.isArray(areas)) return [];
  const cleaned = areas
    .map(a => (typeof a === 'string' ? a.trim() : ''))
    .filter(a => a.length > 0);
  return [...new Set(cleaned)];
};

// ============================================================
// Auto-assign unassigned orders to a delivery boy
// ============================================================
const autoAssignOrdersToDeliveryBoy = async (deliveryBoy) => {
  try {
    if (!deliveryBoy || deliveryBoy.status !== 'active') return { assignedCount: 0 };

    const boyCity = (deliveryBoy.city || '').trim().toLowerCase();
    const wardIds = (deliveryBoy.wardIds || []).map(id => String(id));
    const wardNames = (deliveryBoy.wardNames || []).map(n => (n || '').trim().toLowerCase()).filter(Boolean);
    const areas = (deliveryBoy.areas || []).map(a => (a || '').trim().toLowerCase()).filter(Boolean);

    if (wardIds.length === 0 && areas.length === 0 && wardNames.length === 0) return { assignedCount: 0 };

    const unassignedOrders = await Order.find({
      deliveryStatus: 'unassigned',
      orderStatus: { $in: ['confirmed', 'processing'] }
    });

    if (unassignedOrders.length === 0) return { assignedCount: 0 };

    let assignedCount = 0;
    const now = new Date();

    for (const order of unassignedOrders) {
      let matches = false;

      const orderCity = (order.shippingAddress?.city || '').trim().toLowerCase();
      const cityMatches = !boyCity || !orderCity || orderCity.includes(boyCity);

      // ✅ only match wardId when city matches too
      if (!matches && cityMatches && order.wardId && wardIds.includes(String(order.wardId))) matches = true;

      if (!matches && cityMatches && order.typedArea && wardNames.length > 0) {
        const typedLower = order.typedArea.trim().toLowerCase();
        if (wardNames.includes(typedLower)) matches = true;
      }

      if (!matches && areas.length > 0) {
        const candidates = [
          (order.typedArea || '').trim().toLowerCase(),
          orderCity
        ].filter(Boolean);
        if (candidates.some(c => areas.includes(c))) matches = true;
      }

      if (matches) {
        order.deliveryBoy = deliveryBoy._id;
        order.deliveryStatus = 'assigned';
        order.deliveryAssignedAt = now;
        await order.save();
        assignedCount++;
        console.log(`✅ Auto-assigned ${order.orderId} to ${deliveryBoy.name}`);
      }
    }

    return { assignedCount };
  } catch (error) {
    console.error('❌ Auto-assign error:', error.message);
    return { assignedCount: 0, error: error.message };
  }
};

// ========== CRUD ==========
export const getAllDeliveryBoys = async (request, reply) => {
  try {
    const deliveryBoys = await DeliveryBoy.find().sort({ createdAt: -1 });
    return reply.status(200).send({ success: true, count: deliveryBoys.length, deliveryBoys });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getDeliveryBoyById = async (request, reply) => {
  try {
    const { id } = request.params;
    const deliveryBoy = await DeliveryBoy.findById(id).select('-password');
    if (!deliveryBoy) return reply.status(404).send({ success: false, message: 'Not found' });
    return reply.status(200).send({ success: true, deliveryBoy });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const addDeliveryBoy = async (request, reply) => {
  try {
    const { name, email, phone, password, wardIds, areas, city, vehicleType, vehicleNumber } = request.body;

    const hasWards = Array.isArray(wardIds) && wardIds.length > 0;
    const hasAreas = Array.isArray(areas) && areas.length > 0;

    if (!name || !email || !phone || !password) {
      return reply.status(400).send({ success: false, message: 'Name, email, phone and password are required' });
    }
    if (!hasWards && !hasAreas) {
      return reply.status(400).send({ success: false, message: 'Provide at least one ward or one area' });
    }
    if (hasWards && !city) {
      return reply.status(400).send({ success: false, message: 'City is required when assigning wards' });
    }

    const existing = await DeliveryBoy.findOne({ $or: [{ phone }, { email }] });
    if (existing) return reply.status(400).send({ success: false, message: 'Phone or email exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    // wardIds can be numbers OR strings ("4A"); preserve as-is
    const normalizedWardIds = hasWards
      ? wardIds.map(id => (typeof id === 'string' && isNaN(Number(id))) ? id : parseInt(id))
      : [];

    const normalizedCity = hasWards ? city.trim().toLowerCase() : '';

    // ✅ Pass city so lookup uses the correct ward file
    const wardNames = getWardNames(normalizedWardIds, normalizedCity);
    const normalizedAreas = normalizeAreas(areas);

    const deliveryBoy = new DeliveryBoy({
      name, email, phone,
      password: hashedPassword,
      city: normalizedCity,
      wardIds: normalizedWardIds,
      wardNames,
      areas: normalizedAreas,
      vehicleType: vehicleType || 'bike',
      vehicleNumber: vehicleNumber || '',
      status: 'active',
      isVerified: true
    });

    await deliveryBoy.save();

    const { assignedCount } = await autoAssignOrdersToDeliveryBoy(deliveryBoy);

    return reply.status(201).send({
      success: true,
      message: assignedCount > 0
        ? `Delivery boy added. ${assignedCount} order(s) auto-assigned.`
        : 'Delivery boy added successfully',
      autoAssignedCount: assignedCount,
      deliveryBoy: {
        _id: deliveryBoy._id,
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        city: deliveryBoy.city,
        wardIds: deliveryBoy.wardIds,
        wardNames: deliveryBoy.wardNames,
        areas: deliveryBoy.areas
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const updateDeliveryBoy = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name, email, phone, wardIds, areas, city, vehicleType, vehicleNumber, status, password } = request.body;

    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) return reply.status(404).send({ success: false, message: 'Not found' });

    if (name) deliveryBoy.name = name;
    if (email) deliveryBoy.email = email;
    if (phone) deliveryBoy.phone = phone;

    // Update city first (so wardNames use the correct city)
    if (city !== undefined) deliveryBoy.city = (city || '').trim().toLowerCase();

    if (wardIds !== undefined) {
      const normalizedWardIds = Array.isArray(wardIds)
        ? wardIds.map(v => (typeof v === 'string' && isNaN(Number(v))) ? v : parseInt(v))
        : [];
      deliveryBoy.wardIds = normalizedWardIds;
      // ✅ pass current city
      deliveryBoy.wardNames = getWardNames(normalizedWardIds, deliveryBoy.city);
    }

    if (areas !== undefined) deliveryBoy.areas = normalizeAreas(areas);
    if (vehicleType) deliveryBoy.vehicleType = vehicleType;
    if (vehicleNumber) deliveryBoy.vehicleNumber = vehicleNumber;
    if (status) deliveryBoy.status = status;
    if (password) deliveryBoy.password = await bcrypt.hash(password, 10);

    await deliveryBoy.save();

    let assignedCount = 0;
    if (deliveryBoy.status === 'active') {
      const result = await autoAssignOrdersToDeliveryBoy(deliveryBoy);
      assignedCount = result.assignedCount;
    }

    return reply.status(200).send({
      success: true,
      message: assignedCount > 0
        ? `Delivery boy updated. ${assignedCount} order(s) auto-assigned.`
        : 'Delivery boy updated',
      autoAssignedCount: assignedCount,
      deliveryBoy: {
        _id: deliveryBoy._id,
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone,
        city: deliveryBoy.city,
        wardIds: deliveryBoy.wardIds,
        wardNames: deliveryBoy.wardNames,
        areas: deliveryBoy.areas,
        status: deliveryBoy.status
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const deleteDeliveryBoy = async (request, reply) => {
  try {
    const { id } = request.params;
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) return reply.status(404).send({ success: false, message: 'Not found' });

    const assignedOrders = await Order.countDocuments({
      deliveryBoy: id,
      deliveryStatus: { $in: ['assigned', 'picked_up'] }
    });
    if (assignedOrders > 0) {
      return reply.status(400).send({ success: false, message: `Cannot delete. ${assignedOrders} pending deliveries.` });
    }

    await DeliveryBoy.findByIdAndDelete(id);
    return reply.status(200).send({ success: true, message: 'Deleted' });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getWardsList = async (request, reply) => {
  try {
    const out = [];
    for (const [cityKey, ctx] of citiesWards.entries()) {
      for (const w of ctx.wards) {
        out.push({
          wardId: w.wardId,
          wardName: w.wardName,
          streets: w.streets,
          city: cityKey   // ✅ THIS is what makes the UI split
        });
      }
    }
    return reply.status(200).send({ success: true, wards: out });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getUnassignedOrders = async (request, reply) => {
  try {
    const unassignedOrders = await Order.find({
      deliveryStatus: 'unassigned',
      orderStatus: { $in: ['confirmed', 'processing'] }
    }).sort({ createdAt: 1 }).limit(50);
    return reply.status(200).send({ success: true, count: unassignedOrders.length, orders: unassignedOrders });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const assignOrderToDeliveryBoy = async (request, reply) => {
  try {
    const { orderId, deliveryBoyId } = request.body;
    const order = await Order.findById(orderId);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) return reply.status(404).send({ success: false, message: 'Delivery boy not found' });
    if (deliveryBoy.status !== 'active') return reply.status(400).send({ success: false, message: 'Not active' });

    order.deliveryBoy = deliveryBoyId;
    order.deliveryStatus = 'assigned';
    order.deliveryAssignedAt = new Date();
    await order.save();

    return reply.status(200).send({
      success: true, message: `Assigned to ${deliveryBoy.name}`,
      order: {
        _id: order._id, orderId: order.orderId, deliveryStatus: order.deliveryStatus,
        deliveryBoy: { id: deliveryBoy._id, name: deliveryBoy.name, phone: deliveryBoy.phone }
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getDeliveryBoyStats = async (request, reply) => {
  try {
    const { id } = request.params;
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) return reply.status(404).send({ success: false, message: 'Not found' });

    const allOrders = await Order.find({ deliveryBoy: id }).sort({ createdAt: -1 });
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
      stats: { totalOrders, deliveredOrders, cancelledOrders, pendingOrders, totalEarnings: deliveryBoy.totalEarnings || 0 },
      monthlyStats: [], recentOrders,
      deliveryBoy: {
        id: deliveryBoy._id, name: deliveryBoy.name, email: deliveryBoy.email, phone: deliveryBoy.phone,
        city: deliveryBoy.city || '',
        wardIds: deliveryBoy.wardIds || [], wardNames: deliveryBoy.wardNames || [], areas: deliveryBoy.areas || [],
        vehicleType: deliveryBoy.vehicleType || 'Not specified', vehicleNumber: deliveryBoy.vehicleNumber || '',
        status: deliveryBoy.status || 'inactive', totalDeliveries: deliveryBoy.totalDeliveries || 0,
        totalEarnings: deliveryBoy.totalEarnings || 0, joinedAt: deliveryBoy.createdAt
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getDeliveryBoyOrders = async (request, reply) => {
  try {
    const { id } = request.params;
    const { status, page = 1, limit = 20 } = request.query;
    const filter = { deliveryBoy: id };
    if (status && status !== 'all') {
      if (status === 'delivered') filter.deliveryStatus = 'delivered';
      else if (status === 'cancelled') filter.orderStatus = 'cancelled';
      else if (status === 'pending') filter.deliveryStatus = { $in: ['assigned', 'picked_up'] };
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const totalOrders = await Order.countDocuments(filter);
    return reply.status(200).send({
      success: true, orders,
      pagination: { currentPage: parseInt(page), totalPages: Math.ceil(totalOrders / parseInt(limit)), totalOrders, limit: parseInt(limit) }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};