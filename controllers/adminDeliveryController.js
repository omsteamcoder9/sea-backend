import DeliveryBoy from '../models/DeliveryBoy.js';
import Order from '../models/Order.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🎯 Tamil font paths
const TAMIL_FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansTamil.ttf');
const TAMIL_FONT_BOLD_PATH = fs.existsSync(path.join(__dirname, '../assets/fonts/NotoSansTamil-Bold.ttf'))
  ? path.join(__dirname, '../assets/fonts/NotoSansTamil-Bold.ttf')
  : TAMIL_FONT_PATH;

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

// Flatten ward lookup by ID across cities
const wardsById = new Map();
for (const [_, ctx] of citiesWards.entries()) {
  for (const w of ctx.wards) {
    const key = String(w.wardId);
    if (!wardsById.has(key)) wardsById.set(key, []);
    wardsById.get(key).push(w);
  }
}

const getAllWards = () => {
  const out = [];
  for (const [_, ctx] of citiesWards.entries()) {
    out.push(...ctx.wards);
  }
  return out;
};

const getWardNames = (wardIds, city) => {
  if (!wardIds || !wardIds.length) return [];

  const cityKey = (city || '').trim().toLowerCase();
  const ctx = cityKey ? citiesWards.get(cityKey) : null;

  return wardIds.map(id => {
    if (ctx) {
      const w = ctx.wards.find(x => String(x.wardId) === String(id));
      if (w) return w.wardName;
    }
    const arr = wardsById.get(String(id));
    return arr && arr.length > 0 ? arr[0].wardName : `Ward ${id}`;
  });
};

const normalizeAreas = (areas) => {
  if (!Array.isArray(areas)) return [];
  const cleaned = areas
    .map(a => (typeof a === 'string' ? a.trim() : ''))
    .filter(a => a.length > 0);
  return [...new Set(cleaned)];
};

// ============================================================
// Auto-assign unassigned orders
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

    const normalizedWardIds = hasWards
      ? wardIds.map(id => (typeof id === 'string' && isNaN(Number(id))) ? id : parseInt(id))
      : [];

    const normalizedCity = hasWards ? city.trim().toLowerCase() : '';

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

    if (city !== undefined) deliveryBoy.city = (city || '').trim().toLowerCase();

    if (wardIds !== undefined) {
      const normalizedWardIds = Array.isArray(wardIds)
        ? wardIds.map(v => (typeof v === 'string' && isNaN(Number(v))) ? v : parseInt(v))
        : [];
      deliveryBoy.wardIds = normalizedWardIds;
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
          city: cityKey
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

// ============================================================
// ✅ ADMIN: Edit order address / ward / city / typedArea
// ============================================================
export const editOrderAddress = async (request, reply) => {
  try {
    const { id } = request.params;
    const {
      name,
      phone,
      city,
      wardId,
      typedArea,
      street,
      postalCode,
      state,
      country,
      email,
    } = request.body;

    const order = await Order.findById(id);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });

    const previousWardId = order.wardId;

    if (name !== undefined) {
      order.name = name || '';
      if (!order.shippingAddress) order.shippingAddress = {};
      order.shippingAddress.name = name || '';
    }

    if (!order.shippingAddress) order.shippingAddress = {};

    if (phone !== undefined) order.shippingAddress.phone = phone || '';
    if (street !== undefined) order.shippingAddress.street = street || '';
    if (postalCode !== undefined) order.shippingAddress.postalCode = postalCode || '';
    if (state !== undefined) order.shippingAddress.state = state || '';
    if (country !== undefined) order.shippingAddress.country = country || '';
    if (email !== undefined) order.shippingAddress.email = email || '';

    if (city !== undefined) {
      order.shippingAddress.city = (city || '').trim();
    }

    if (typedArea !== undefined) {
      order.typedArea = (typedArea || '').trim();
    }

    if (wardId !== undefined) {
      const incoming = (wardId === '' || wardId === null) ? null : wardId;

      if (incoming === null) {
        order.wardId = null;
        order.wardName = null;
      } else {
        const normalizedCity = (order.shippingAddress?.city || '').trim().toLowerCase();
        const ctx = normalizedCity ? citiesWards.get(normalizedCity) : null;

        let matched = null;
        if (ctx) {
          matched = ctx.wards.find(w => String(w.wardId) === String(incoming));
        }
        if (!matched) {
          matched = getAllWards().find(w => String(w.wardId) === String(incoming));
        }

        if (matched) {
          order.wardId = matched.wardId;
          order.wardName = matched.wardName;
        } else {
          const num = isNaN(Number(incoming)) ? incoming : parseInt(incoming);
          order.wardId = num;
          order.wardName = `Ward ${num}`;
        }
      }
    }

    if (order.deliveryZone === undefined || order.deliveryZone === null) {
      order.deliveryZone = 'standard';
    }

    const wardChanged = previousWardId !== order.wardId;

    let reassignedTo = null;
    let oldBoyId = null;

    if (wardChanged && order.wardId) {
      oldBoyId = order.deliveryBoy || null;

      const normalizedCity = (order.shippingAddress?.city || '').trim().toLowerCase();

      const candidates = await DeliveryBoy.find({
        status: 'active',
        wardIds: { $in: [order.wardId] }
      });

      let matchedBoy = null;
      if (normalizedCity) {
        matchedBoy = candidates.find(boy => {
          const boyCity = (boy.city || '').trim().toLowerCase();
          return boyCity && boyCity === normalizedCity;
        });
      }
      if (!matchedBoy && candidates.length > 0) {
        matchedBoy = candidates[0];
      }

      if (matchedBoy) {
        if (!oldBoyId || String(oldBoyId) !== String(matchedBoy._id)) {
          order.deliveryBoy = matchedBoy._id;
          order.deliveryStatus = 'assigned';
          order.deliveryAssignedAt = new Date();
          order.deliveryPickedUpAt = null;
          order.deliveryDeliveredAt = null;
          reassignedTo = matchedBoy;
        }
      } else {
        order.deliveryBoy = null;
        order.deliveryStatus = 'unassigned';
        order.deliveryAssignedAt = null;
        order.deliveryPickedUpAt = null;
        order.deliveryDeliveredAt = null;
      }
    }

    await order.save();

    console.log(`✏️ Order ${order.orderId} address updated`);
    if (reassignedTo) {
      console.log(`🔁 Auto-reassigned to ${reassignedTo.name} (Ward ${order.wardId})`);
    } else if (wardChanged && !order.deliveryBoy) {
      console.log(`🚫 No delivery boy for Ward ${order.wardId} → order unassigned`);
    }

    return reply.status(200).send({
      success: true,
      message: reassignedTo
        ? `Address updated. Reassigned to ${reassignedTo.name}`
        : 'Address updated',
      reassigned: !!reassignedTo,
      reassignedTo: reassignedTo
        ? { _id: reassignedTo._id, name: reassignedTo.name, phone: reassignedTo.phone, city: reassignedTo.city, wardIds: reassignedTo.wardIds }
        : null,
      order: {
        _id: order._id,
        orderId: order.orderId,
        name: order.name,
        wardId: order.wardId,
        wardName: order.wardName,
        typedArea: order.typedArea,
        shippingAddress: order.shippingAddress,
        deliveryBoy: order.deliveryBoy
          ? { _id: order.deliveryBoy, name: reassignedTo?.name || null }
          : null,
        deliveryStatus: order.deliveryStatus,
        deliveryAssignedAt: order.deliveryAssignedAt,
      },
    });
  } catch (error) {
    console.error('Edit order address error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// ============================================================
// ✅ ADMIN: Download today's orders PDF (WITH TAMIL FONT)
// ============================================================
export const downloadTodayOrdersPDF = async (request, reply) => {
  try {
    const PDFDocument = (await import('pdfkit')).default;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const tomorrow = new Date(startOfDay);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const fmtLong = (d) => d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const fmtShort = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });

    const orders = await Order.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      orderStatus: { $ne: 'cancelled' }
    }).sort({ createdAt: 1 });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    // 🎯 Register Tamil font
    doc.registerFont('Tamil', TAMIL_FONT_PATH);
    doc.registerFont('Tamil-Bold', TAMIL_FONT_BOLD_PATH);

    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const leftMargin = doc.page.margins.left;
      const rightMargin = doc.page.margins.right;
      const contentWidth = pageWidth - leftMargin - rightMargin;

      // ===== Header =====
      doc.font('Tamil-Bold').fontSize(20).fillColor('#1a237e')
        .text("TODAY'S ORDERS", { align: 'center' });
      doc.moveDown(0.3);

      doc.font('Tamil').fontSize(10).fillColor('#333')
        .text(`Order Today • Get Tomorrow (${fmtShort(tomorrow)})`, { align: 'center' });
      doc.moveDown(0.2);

      doc.font('Tamil').fontSize(9).fillColor('#555')
        .text(`Date: ${fmtLong(now)}`, { align: 'center' });
      doc.moveDown(0.2);

      doc.font('Tamil-Bold').fontSize(10).fillColor('#000')
        .text(`Total Orders: ${orders.length}`, { align: 'center' });
      doc.moveDown(1);

      // ===== Table header =====
      const colX = {
        sn: leftMargin,
        order: leftMargin + 25,
        customer: leftMargin + 115,
        phone: leftMargin + 215,
        product: leftMargin + 310,
        weight: leftMargin + 430
      };
      const tableTop = doc.y;

      doc.font('Tamil-Bold').fontSize(9).fillColor('#000');
      doc.text('#', colX.sn, tableTop);
      doc.text('Order ID', colX.order, tableTop);
      doc.text('Customer', colX.customer, tableTop);
      doc.text('Phone', colX.phone, tableTop);
      doc.text('Product', colX.product, tableTop);
      doc.text('Weight', colX.weight, tableTop);

      doc.moveTo(leftMargin, tableTop + 14)
         .lineTo(pageWidth - rightMargin, tableTop + 14)
         .strokeColor('#999').stroke();

      let y = tableTop + 22;

      // ===== Rows =====
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i];

        const customerName =
          o.name ||
          o.shippingAddress?.name ||
          o.user?.name ||
          'Customer';

        const phone = o.shippingAddress?.phone || '';

const productNames = (o.products || [])
  .map(p => {
    const qty = p.quantity ? ` , quantity : ${p.quantity}` : '';
    return `${p.name || 'Item'}${qty}`;
  })
  .join(', ');

        const weightText = (o.products || [])
          .map(p => {
            if (!p.weight || p.weight <= 0) return '—';
            const unit = p.weightUnit === 'gram' ? 'g' : p.weightUnit === 'kg' ? 'kg' : (p.weightUnit || '');
            return `${p.weight}${unit}`;
          })
          .join(', ');

        const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;
        if (y > bottomLimit) {
          doc.addPage();
          doc.registerFont('Tamil', TAMIL_FONT_PATH);
          doc.registerFont('Tamil-Bold', TAMIL_FONT_BOLD_PATH);
          y = doc.page.margins.top;
        }

        doc.font('Tamil').fontSize(8).fillColor('#000');

        doc.text(String(i + 1), colX.sn, y, { width: 20 });
        doc.text(o.orderId || o._id.toString().slice(-8), colX.order, y, { width: 85 });
        doc.text(customerName, colX.customer, y, { width: 95 });
        doc.text(phone, colX.phone, y, { width: 90 });
        doc.text(productNames, colX.product, y, { width: 115 });
        doc.text(weightText, colX.weight, y, { width: pageWidth - rightMargin - colX.weight });

        const hOrder = doc.heightOfString(o.orderId || '', { width: 85 });
        const hCustomer = doc.heightOfString(customerName, { width: 95 });
        const hPhone = doc.heightOfString(phone, { width: 90 });
        const hProduct = doc.heightOfString(productNames, { width: 115 });
        const hWeight = doc.heightOfString(weightText, { width: pageWidth - rightMargin - colX.weight });
        const rowHeight = Math.max(hOrder, hCustomer, hPhone, hProduct, hWeight, 12);

        y += rowHeight + 6;

        doc.moveTo(leftMargin, y - 3)
           .lineTo(pageWidth - rightMargin, y - 3)
           .strokeColor('#eee').stroke();
      }

      // ===== Footer =====
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 30;
      if (y < bottomLimit) {
        doc.moveDown(2);
      }
      doc.fontSize(8).fillColor('#666')
        .text(`Generated: ${new Date().toLocaleString('en-IN')}`, {
          align: 'center',
          width: contentWidth
        });

      doc.end();
    });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="today-orders-${now.toISOString().slice(0,10)}.pdf"`);
    return reply.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Download today orders PDF error:', error);
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