import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/productModel.js';
import Setting from '../models/Setting.js';
import User from '../models/User.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
  sendOrderCancellationEmail,
  sendOrderRefundEmail,
} from '../services/emailService.js';
import {
  sendOrderConfirmationSMS,
  sendOrderStatusSMS,
  sendOrderCancellationSMS,
  sendOrderRefundSMS
} from '../services/smsService.js';

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
// ✅ LOAD city ward files
// ============================================================
const citiesWards = new Map();

const loadCityWards = (cityKey, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Ward file not found for ${cityKey}: ${filePath}`);
      return;
    }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rawWards = raw.wards || [];
    const wards = rawWards.map(normalizeWard);

    const streetToWardMap = new Map();
    for (const ward of wards) {
      for (const street of (ward.streets || [])) {
        const normalizedStreet = street.toLowerCase().trim();
        if (!streetToWardMap.has(normalizedStreet)) {
          streetToWardMap.set(normalizedStreet, {
            wardId: ward.wardId,
            wardName: ward.wardName,
            deliveryZone: 'standard'
          });
        }
      }
    }

    citiesWards.set(cityKey, { city: cityKey, wards, streetToWardMap });
    console.log(`✅ Loaded ${wards.length} wards for "${cityKey}" (${streetToWardMap.size} streets)`);
  } catch (error) {
    console.error(`❌ Error loading wards for ${cityKey}:`, error.message);
  }
};

loadCityWards('karaikudi', path.join(__dirname, '../data/Karaikudi_Wards.json'));
loadCityWards('pudukkottai', path.join(__dirname, '../data/Pudukkottai_Wards.json'));

// ============================================================
// City context
// ============================================================
const getCityContext = (city) => {
  if (!city) return null;
  const c = city.trim().toLowerCase();
  for (const [key, ctx] of citiesWards.entries()) {
    if (c.includes(key)) return ctx;
  }
  return null;
};

// ============================================================
// Helpers
// ============================================================
const extractCoreStreetName = (street) => {
  let cleaned = street.toLowerCase().trim();
  cleaned = cleaned.replace(/^\d+\s+/, '');
  cleaned = cleaned.replace(/^(no\.?|near|opp|behind|next to|beside|at|in)\s+/i, '');
  cleaned = cleaned.replace(/\s+(street|road|st|rd|nagar|colony|lane|sanctuary|area)$/i, '');
  cleaned = cleaned.replace(/\s+(vadaku|thenvadal|kilamel|melpagam|kilpagam)$/i, '');
  return cleaned.trim();
};

const isPointInPolygon = (lat, lon, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > lat) != (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const findWardByCoordinates = (lat, lon, cityContext) => {
  if (!cityContext) return null;
  for (const ward of cityContext.wards) {
    if (ward.polygon && ward.polygon.length > 2 && isPointInPolygon(lat, lon, ward.polygon)) {
      return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
    }
  }
  return null;
};

const findWardByExactStreetMatch = (streetName, cityContext) => {
  if (!cityContext) return null;
  const normalizedInput = streetName.toLowerCase().trim();
  if (cityContext.streetToWardMap.has(normalizedInput)) {
    const ward = cityContext.streetToWardMap.get(normalizedInput);
    console.log(`✅ EXACT match: "${streetName}" → Ward ${ward.wardId}: ${ward.wardName}`);
    return ward;
  }
  return null;
};

const findWardByCoreStreetName = (streetName, cityContext) => {
  if (!cityContext) return null;
  const coreName = extractCoreStreetName(streetName);
  console.log(`🔍 Extracted core: "${coreName}" from "${streetName}"`);
  if (coreName.length < 3) return null;

  for (const ward of cityContext.wards) {
    for (const street of (ward.streets || [])) {
      const streetCore = extractCoreStreetName(street);
      if (coreName === streetCore) {
        console.log(`✅ Core match: "${coreName}" == "${streetCore}" → Ward ${ward.wardId}`);
        return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
      }
      if (streetCore.includes(coreName) && coreName.length > 4) {
        console.log(`✅ Core contained: "${coreName}" in "${streetCore}" → Ward ${ward.wardId}`);
        return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
      }
      if (coreName.includes(streetCore) && streetCore.length > 4) {
        console.log(`✅ Core contains street: "${streetCore}" in "${coreName}" → Ward ${ward.wardId}`);
        return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
      }
    }
  }
  return null;
};

const findWardByKeyword = (address, cityContext) => {
  if (!cityContext) return null;
  const streetLower = address.street.toLowerCase();

  if (cityContext.city === 'karaikudi') {
    const keywordToWard = {
      'kalanivasal': 1, 'alagappan': 2, 'arumuga': 3, 'subramaniyapuram': 4,
      'teppakullam': 4, 'nadesan': 6, 'paventhar': 7, 'meenashi': 8,
      'meenatchi': 8, 'gandipuram': 11, 'muthupattinam': 12, 'kamban': 14,
      'bharathi nagar': 17, 'vallalar': 17, 'railway': 17, 'soodamanipuram': 18,
      'kurichipuravu': 19, 'church': 20, 'muthuoorani': 22, 'kallukati': 23,
      'sivan sanathi': 24, 'kurichi konmoi': 25, 'indira nagar': 26,
      'karunanithi nagar': 27, 'shiva nagar': 28, 'vaniyangali': 28,
      'nallaiyan': 29, 'sathiya nagar': 30, 'killaoorani': 31, 'chokkalingam': 32,
      'pananthoppu': 33, 'pappa oorani': 34, 'vaithiyalingapuram': 35, 'veeraiyan kanmoi': 36
    };
    for (const [keyword, targetWardId] of Object.entries(keywordToWard)) {
      if (streetLower.includes(keyword)) {
        const ward = cityContext.wards.find(w => w.wardId === targetWardId);
        if (ward) {
          console.log(`✅ KEYWORD match: "${keyword}" → Ward ${targetWardId}`);
          return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
        }
      }
    }
  }

  return null;
};

const findWardByTypedArea = (typedArea, cityContext) => {
  if (!cityContext || !typedArea) return null;
  const normalized = typedArea.trim().toLowerCase();
  if (normalized.length < 3) return null;

  for (const ward of cityContext.wards) {
    if ((ward.wardName || '').toLowerCase().trim() === normalized) {
      console.log(`✅ typedArea EXACT: "${typedArea}" → Ward ${ward.wardId}`);
      return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
    }
  }
  for (const ward of cityContext.wards) {
    const wardNameLower = (ward.wardName || '').toLowerCase().trim();
    if (wardNameLower && (wardNameLower.includes(normalized) || normalized.includes(wardNameLower))) {
      console.log(`✅ typedArea PARTIAL: "${typedArea}" ↔ "${ward.wardName}"`);
      return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
    }
  }
  for (const ward of cityContext.wards) {
    for (const street of (ward.streets || [])) {
      if (street.toLowerCase().trim() === normalized) {
        console.log(`✅ typedArea STREET: "${typedArea}" → Ward ${ward.wardId}`);
        return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
      }
    }
  }
  return null;
};

const geocodeAddress = async (address) => {
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const addressString = `${address.street}, ${address.city}, ${address.state}, ${address.postalCode}`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      console.log(`📍 Geocoded: (${location.lat}, ${location.lng})`);
      return { lat: location.lat, lng: location.lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
};

const matchWard = async (shippingAddress, typedArea) => {
  const cityContext = getCityContext(shippingAddress.city);
  if (!cityContext) {
    console.log(`🌍 Unsupported city "${shippingAddress.city}"`);
    return { wardId: null, wardName: null, deliveryZone: 'standard' };
  }

  console.log(`🏙️ City detected: ${cityContext.city}`);

  let wardInfo = findWardByExactStreetMatch(shippingAddress.street, cityContext);
  if (wardInfo) return wardInfo;

  wardInfo = findWardByCoreStreetName(shippingAddress.street, cityContext);
  if (wardInfo) return wardInfo;

  wardInfo = findWardByKeyword(shippingAddress, cityContext);
  if (wardInfo) return wardInfo;

  wardInfo = findWardByTypedArea(typedArea, cityContext);
  if (wardInfo) return wardInfo;

  const coords = await geocodeAddress(shippingAddress);
  if (coords) {
    wardInfo = findWardByCoordinates(coords.lat, coords.lng, cityContext);
    if (wardInfo) return wardInfo;
  }

  console.log(`⚠️ No ward match in ${cityContext.city}`);
  return { wardId: null, wardName: null, deliveryZone: 'standard' };
};

// ============================================================
// Store settings cache
// ============================================================
let cachedSettings = null;
let settingsCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000;

const getStoreSettings = async () => {
  const now = Date.now();
  if (cachedSettings && settingsCacheTime && (now - settingsCacheTime) < CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    const settings = await Setting.getSettings();
    cachedSettings = {
      siteName: settings.siteName,
      contactEmail: settings.contactEmail || 'contact@example.com',
      contactNumber: settings.contactNumber || '+91 98765 43210',
      companyAddress: settings.companyAddress || 'Ganga Enterprise, 2nd Floor, Spencer Plaza, Anna Salai, Chennai',
      socialMedia: settings.socialMedia || {},
      razorpayKeyId: settings.razorpayKeyId || '',
      razorpayKeySecret: settings.razorpayKeySecret || ''
    };
    settingsCacheTime = now;
    return cachedSettings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {
      siteName: '', contactEmail: 'contact@example.com', contactNumber: '+91 98765 43210',
      companyAddress: 'Ganga Enterprise, 2nd Floor, Spencer Plaza, Anna Salai, Chennai',
      socialMedia: {}, razorpayKeyId: '', razorpayKeySecret: ''
    };
  }
};

// ============================================================
// Stock helpers
// ============================================================
const updateProductStock = async (products) => {
  console.log(`\n📦 Stock update for ${products.length} items...`);
  for (const item of products) {
    if (!item.variantId && !item.variantName) {
      console.log(`❌ SKIPPED: No variant for "${item.name}"`);
      continue;
    }

    const product = await Product.findById(item.product);
    if (!product || !product.variants || product.variants.length === 0) continue;

    let variantIndex = -1;
    if (item.variantId && item.variantId !== 'null') {
      variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
    }
    if (variantIndex === -1 && item.variantName) {
      variantIndex = product.variants.findIndex(v => v.variantName === item.variantName);
    }
    if (variantIndex === -1) continue;

    product.variants[variantIndex].stock -= item.quantity;
    product.stock = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
    await product.save();
    console.log(`✅ Stock reduced: ${item.name} → ${product.variants[variantIndex].stock}`);
  }
};

const restoreProductStock = async (products) => {
  for (const item of products) {
    if (item.variantId) {
      const product = await Product.findById(item.product);
      if (product && product.variants) {
        const variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
        if (variantIndex !== -1) {
          product.variants[variantIndex].stock += item.quantity;
          product.stock = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
          await product.save();
        }
      }
    }
  }
};

// ========== CREATE ORDER ==========
export const createOrder = async (request, reply) => {
  try {
    const userId = request.user?.userId || request.user?.id || null;
    const {
      shippingAddress,
      paymentMethod,
      paymentId,
      skipCartClear,
      products: bodyProducts,
      typedArea
    } = request.body;

    if (!shippingAddress || !paymentMethod) {
      return reply.status(400).send({ success: false, message: 'Shipping address and payment method are required' });
    }

    const requiredFields = ['street', 'city', 'state', 'postalCode', 'country', 'phone'];
    for (const field of requiredFields) {
      if (!shippingAddress[field]) {
        return reply.status(400).send({ success: false, message: `Shipping address field '${field}' is required` });
      }
    }

    let totalAmount = 0;
    let products = [];

    if (skipCartClear && bodyProducts && bodyProducts.length > 0) {
      console.log(`🛒 Buy Now mode - ${bodyProducts.length} products`);

      for (const item of bodyProducts) {
        const product = await Product.findById(item.product);
        if (!product) {
          return reply.status(404).send({ success: false, message: `Product not found: ${item.product}` });
        }

        const price = item.price;
        const variantId = item.variantId;
        const variantName = item.variantName || '';
        let variant = null;
        let originalPrice = price;

        if (variantId && product.variants && product.variants.length > 0) {
          variant = product.variants.find(v => v._id.toString() === variantId);
          if (variant) originalPrice = variant.originalPrice || variant.price || price;
        }

        if (variant && variant.stock < item.quantity) {
          return reply.status(400).send({ success: false, message: `Insufficient stock for ${product.name} - ${variantName}` });
        } else if (!variant && product.stock < item.quantity) {
          return reply.status(400).send({ success: false, message: `Insufficient stock for ${product.name}` });
        }

        const itemTotal = item.quantity * price;
        totalAmount += itemTotal;

        let discountPercentage = 0;
        if (originalPrice > price) discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);

        const productImage = product.images && product.images.length > 0 ? product.images[0].image : product.ogImage || null;

        products.push({
          product: product._id, variantId, variantName,
          quantity: item.quantity, price, originalPrice, discountPercentage,
          name: product.name, image: productImage,
          weight: item.weight || 0, weightUnit: item.weightUnit || 'gram'
        });
      }
    } else {
      console.log(`🛒 Normal checkout`);

      const cart = await Cart.findOne({ user: userId }).populate('items.product');
      if (!cart || cart.items.length === 0) {
        return reply.status(400).send({ success: false, message: 'Cart is empty' });
      }

      for (const item of cart.items) {
        const product = await Product.findById(item.product._id);
        if (!product) {
          return reply.status(404).send({ success: false, message: `Product not found` });
        }

        let itemWeight = item.weight || 0;
        let itemWeightUnit = item.weightUnit || 'gram';

        if (product.variants && product.variants.length > 0) {
          const hasVariant = (item.variantId && item.variantId !== '' && item.variantId !== 'null') ||
                            (item.variantName && item.variantName !== '');
          if (!hasVariant) {
            return reply.status(400).send({ success: false, message: `Please select a variant for ${product.name}` });
          }

          let variant = null;
          if (item.variantId && item.variantId !== 'null') {
            variant = product.variants.find(v => v._id.toString() === item.variantId);
          } else if (item.variantName) {
            variant = product.variants.find(v => v.variantName === item.variantName);
          }

          if (!variant) {
            return reply.status(400).send({ success: false, message: `Variant not found for ${product.name}` });
          }
          if (variant.stock < item.quantity) {
            return reply.status(400).send({ success: false, message: `Insufficient stock for ${product.name} - ${variant.variantName}` });
          }
          if (!itemWeight && variant.weight) {
            itemWeight = variant.weight;
            itemWeightUnit = variant.weightUnit || 'gram';
          }
        } else {
          if (product.stock < item.quantity) {
            return reply.status(400).send({ success: false, message: `Insufficient stock for ${product.name}` });
          }
        }

        const itemPrice = item.price || product.basePrice;
        const itemTotal = item.quantity * itemPrice;
        totalAmount += itemTotal;

        const productImage = product.images && product.images.length > 0 ? product.images[0].image : product.ogImage || null;

        let discountPercentage = 0;
        let originalPrice = item.originalPrice || itemPrice;
        if (originalPrice > itemPrice) discountPercentage = Math.round(((originalPrice - itemPrice) / originalPrice) * 100);

        products.push({
          product: product._id,
          variantId: item.variantId || null,
          variantName: item.variantName || '',
          quantity: item.quantity, price: itemPrice, originalPrice, discountPercentage,
          name: product.name, image: productImage,
          weight: itemWeight, weightUnit: itemWeightUnit
        });
      }
    }

    if (isNaN(totalAmount) || totalAmount <= 0) {
      return reply.status(400).send({ success: false, message: 'Invalid order total calculated' });
    }

    const shippingFee = 0;
    const taxAmount = Math.round((totalAmount * 5) / 100);
    const discountAmount = products.reduce((sum, item) => {
      if (item.originalPrice > item.price) {
        return sum + ((item.originalPrice - item.price) * item.quantity);
      }
      return sum;
    }, 0);
    const finalAmount = totalAmount + shippingFee + taxAmount;

    console.log(`💰 Subtotal: ${totalAmount}, Tax: ${taxAmount}, Final: ${finalAmount}`);

    const wardInfo = await matchWard(shippingAddress, typedArea);

    if (wardInfo.wardId) {
      console.log(`✅ Ward assigned: ${wardInfo.wardId} - ${wardInfo.wardName}`);
    } else {
      console.log(`🌍 No ward assigned`);
    }

    const customerName = shippingAddress.name || 'Customer';

    const order = await Order.create({
      user: userId,
      name: customerName,
      products,
      shippingAddress: {
        ...shippingAddress,
        name: shippingAddress.name || ''
      },
      wardId: wardInfo.wardId,
      wardName: wardInfo.wardName,
      deliveryZone: wardInfo.deliveryZone,
      typedArea: typedArea ? typedArea.trim() : '',
      paymentMethod,
      paymentId: paymentMethod !== 'cod' ? paymentId : undefined,
      paymentStatus: 'pending',
      orderStatus: paymentMethod === 'cod' ? 'confirmed' : 'pending',
      totalAmount: Number(totalAmount.toFixed(2)),
      shippingFee: Number(shippingFee.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      finalAmount: Number(finalAmount.toFixed(2))
    });

    console.log(`✅ Order created: ${order.orderId}`);

    // ❌ AUTO-ASSIGN REMOVED — admin assigns manually

    if (paymentMethod === 'cod') {
      await updateProductStock(products);
      order.orderStatus = 'confirmed';
      await order.save();
    }

    if (!skipCartClear && userId) {
      await Cart.findOneAndUpdate(
        { user: userId },
        { $set: { items: [], totalItems: 0, totalPrice: 0, totalOriginalPrice: 0, totalSavings: 0 } }
      );
      console.log(`🗑️ Cart cleared`);
    }

    if (paymentMethod === 'cod') {
      const customerEmail = shippingAddress.email;
      const customerPhone = shippingAddress.phone;

      if (customerEmail) {
        try { await sendOrderConfirmationEmail(order, { email: customerEmail, name: customerName }); } catch (e) { console.error(e); }
      }
      if (customerPhone) {
        try { await sendOrderConfirmationSMS(customerPhone, order); } catch (e) { console.error(e); }
      }
    }

    return reply.status(201).send({
      success: true,
      message: 'Order created successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        sNo: order.sNo,
        name: order.name,
        products: order.products,
        shippingAddress: order.shippingAddress,
        wardId: order.wardId,
        wardName: order.wardName,
        typedArea: order.typedArea,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount,
        shippingFee: order.shippingFee,
        taxAmount: order.taxAmount,
        discountAmount: order.discountAmount,
        finalAmount: order.finalAmount,
        createdAt: order.createdAt
      },
      requiresPayment: paymentMethod !== 'cod'
    });

  } catch (error) {
    console.error('❌ Create order error:', error);
    return reply.status(500).send({ success: false, message: error.message || 'Internal server error' });
  }
};

// ========== UPDATE ORDER PAYMENT SUCCESS ==========
export const updateOrderPaymentSuccess = async (request, reply) => {
  try {
    const { orderId, paymentId } = request.body;
    if (!orderId || !paymentId) {
      return reply.status(400).send({ success: false, message: 'Order ID and Payment ID are required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    if (order.paymentStatus === 'completed') {
      return reply.status(200).send({ success: true, message: 'Already completed', order });
    }

    if (order.paymentMethod === 'razorpay') {
      for (const item of order.products) {
        if (item.variantId) {
          const product = await Product.findById(item.product);
          if (product && product.variants) {
            const idx = product.variants.findIndex(v => v._id.toString() === item.variantId);
            if (idx !== -1) {
              product.variants[idx].stock -= item.quantity;
              product.stock = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
              await product.save();
            }
          }
        }
      }
    }

    order.paymentStatus = 'completed';
    order.orderStatus = 'confirmed';
    order.paymentId = paymentId;
    order.paidAt = new Date();
    await order.save();

    const customerEmail = order.shippingAddress?.email;
    const customerPhone = order.shippingAddress?.phone;
    const customerName = order.name || order.shippingAddress?.name || 'Customer';

    if (customerEmail) {
      try { await sendOrderConfirmationEmail(order, { email: customerEmail, name: customerName }); } catch (e) { console.error(e); }
    }
    if (customerPhone) {
      try { await sendOrderConfirmationSMS(customerPhone, order); } catch (e) { console.error(e); }
    }

    return reply.status(200).send({
      success: true, message: 'Payment updated',
      order: {
        _id: order._id, orderId: order.orderId, name: order.name,
        orderStatus: order.orderStatus, paymentStatus: order.paymentStatus
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// ========== OTHER FUNCTIONS ==========
export const getUserOrders = async (request, reply) => {
  try {
    const userId = request.user.userId || request.user.id;
    const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
    return reply.status(200).send({ success: true, orders });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getOrderById = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';
    const order = await Order.findById(id);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    if (order.user.toString() !== userId && !isAdmin) {
      return reply.status(403).send({ success: false, message: 'Unauthorized' });
    }
    return reply.status(200).send({ success: true, order });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getAllOrders = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });
    const { status, paymentStatus, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = request.query;
    const filter = {};
    if (status) filter.orderStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const orders = await Order.find(filter).populate('user', 'name phone').sort(sort).skip(skip).limit(parseInt(limit));
    const totalOrders = await Order.countDocuments(filter);
    return reply.status(200).send({
      success: true, orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        totalOrders, limit: parseInt(limit)
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getOrderStats = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    const ordersByStatus = await Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]);
    const ordersByPaymentStatus = await Order.aggregate([{ $group: { _id: '$paymentStatus', count: { $sum: 1 } } }]);
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name');
    return reply.status(200).send({
      success: true,
      stats: { totalOrders, totalRevenue: totalRevenue[0]?.total || 0, ordersByStatus, ordersByPaymentStatus, recentOrders }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const updateOrderStatus = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });
    const { id } = request.params;
    const { orderStatus, paymentStatus, cancellationReason } = request.body;
    const order = await Order.findById(id);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    const oldStatus = order.orderStatus;

    if (orderStatus) {
      if (orderStatus === 'delivered' && order.orderStatus !== 'delivered') order.deliveredAt = new Date();
      if (orderStatus === 'cancelled' && order.orderStatus !== 'cancelled') {
        order.cancelledAt = new Date();
        if (cancellationReason) order.cancellationReason = cancellationReason;
        await restoreProductStock(order.products);
        order.deliveryStatus = 'unassigned';
        order.deliveryBoy = null;
        order.deliveryAssignedAt = null;
        order.deliveryPickedUpAt = null;
        order.deliveryDeliveredAt = null;
      }
      order.orderStatus = orderStatus;
    }
    if (paymentStatus) {
      if (paymentStatus === 'completed' && order.paymentStatus !== 'completed') order.paidAt = new Date();
      order.paymentStatus = paymentStatus;
    }

    await order.save();

    if (orderStatus && oldStatus !== orderStatus) {
      const customerEmail = order.shippingAddress?.email;
      const customerName = order.name || order.shippingAddress?.name || 'Customer';
      const customerPhone = order.shippingAddress?.phone;

      if (customerEmail) {
        try { await sendOrderStatusUpdateEmail(order, { email: customerEmail, name: customerName }, oldStatus, orderStatus); } catch (e) { console.error(e); }
      }
      if (customerPhone) {
        try { await sendOrderStatusSMS(customerPhone, order, orderStatus); } catch (e) { console.error(e); }
      }
    }

    return reply.status(200).send({
      success: true, message: 'Order updated',
      order: {
        _id: order._id, orderId: order.orderId, name: order.name,
        orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus, paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt, cancelledAt: order.cancelledAt
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getAdminOrderById = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });
    const { id } = request.params;
    const order = await Order.findById(id).populate('user', 'name phone').populate('products.product', 'name basePrice images');
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    return reply.status(200).send({ success: true, order });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const printOrderReceipt = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';
    const order = await Order.findById(id).populate('user', 'name').populate('products.product', 'name price image');
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    const isOrderOwner = order.user && order.user._id.toString() === userId;
    if (!isOrderOwner && !isAdmin) return reply.status(403).send({ success: false, message: 'Not authorized' });

    const storeSettings = await getStoreSettings();

    const customerName =
      order.name ||
      order.shippingAddress?.name ||
      order.user?.name ||
      'Customer';

    const receiptData = {
      receiptNumber: order._id.toString(),
      orderNumber: order.orderId || order._id.toString(),
      date: order.createdAt,
      store: { name: storeSettings.siteName, email: storeSettings.contactEmail, phone: storeSettings.contactNumber, address: storeSettings.companyAddress },
      customer: { id: order.user?._id, name: customerName },
      wardName: order.wardName || null,
      typedArea: order.typedArea || null,
      shippingAddress: order.shippingAddress,
      items: order.products.map(item => ({
        name: item.name, quantity: item.quantity, price: item.price,
        total: (item.quantity * item.price).toFixed(2),
        variantName: item.variantName,
        weight: item.weight || 0, weightUnit: item.weightUnit || 'gram'
      })),
      pricing: { subtotal: order.totalAmount || 0, tax: order.taxAmount || 0, shipping: order.shippingFee || 0, total: order.finalAmount || 0 },
      payment: { method: order.paymentMethod, status: order.paymentStatus, paidAt: order.paidAt }
    };
    return reply.status(200).send({ success: true, message: 'Receipt generated', receipt: receiptData });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const printOrderReceiptPDF = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';
    const order = await Order.findById(id).populate('user', 'name').populate('products.product', 'name price image');
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    const isOrderOwner = order.user && order.user._id.toString() === userId;
    if (!isOrderOwner && !isAdmin) return reply.status(403).send({ success: false, message: 'Not authorized' });

    const storeSettings = await getStoreSettings();

    const customerName =
      order.name ||
      order.shippingAddress?.name ||
      order.user?.name ||
      'Customer';

    const receiptData = {
      receiptNumber: order._id.toString(),
      orderNumber: order.orderId || order._id.toString(),
      date: order.createdAt,
      store: { name: storeSettings.siteName, email: storeSettings.contactEmail, phone: storeSettings.contactNumber, address: storeSettings.companyAddress },
      customer: { name: customerName },
      wardName: order.wardName || null,
      typedArea: order.typedArea || null,
      shippingAddress: order.shippingAddress,
      items: order.products.map(item => ({
        name: item.name, quantity: item.quantity, price: item.price,
        total: (item.quantity * item.price).toFixed(2),
        variantName: item.variantName,
        weight: item.weight || 0, weightUnit: item.weightUnit || 'gram'
      })),
      pricing: { subtotal: order.totalAmount || 0, tax: order.taxAmount || 0, shipping: order.shippingFee || 0, total: order.finalAmount || 0 },
      payment: { method: order.paymentMethod, status: order.paymentStatus }
    };

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="receipt-${order.orderId}.pdf"`);
    const pdfBuffer = await generateReceiptPDFBuffer(receiptData);
    return reply.status(200).send(pdfBuffer);
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// ============================================================
// PDF helpers (unchanged)
// ============================================================
const generateReceiptPDFBuffer = async (receiptData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = await import('pdfkit').then(m => m.default);
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      addPDFHeader(doc, receiptData);
      addPDFCustomerInfo(doc, receiptData);
      addPDFItemsTable(doc, receiptData);
      addPDFTotals(doc, receiptData);
      addPDFFooter(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const addPDFHeader = (doc, data) => {
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a237e')
     .text(data.store.name, { align: 'center' }).moveDown(0.5);
  doc.fontSize(10).font('Helvetica').fillColor('#666')
     .text('Order Receipt', { align: 'center' }).moveDown(1);
};

const addPDFCustomerInfo = (doc, data) => {
  const pageWidth = doc.page.width;
  const leftMargin = doc.page.margins.left;
  const rightMargin = doc.page.margins.right;
  const startX = leftMargin;
  const startY = doc.y;
  const fromWidth = 150;
  const orderColumnX = 235;
  const orderWidth = 145;
  const toColumnX = 415;
  const toWidth = pageWidth - rightMargin - toColumnX;

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('FROM:', startX, startY);
  let fromY = startY + 18;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');

  const fromLines = [
    data.store?.name,
    ...(data.store?.address ? data.store.address.split(',').map(line => line.trim()).filter(Boolean) : []),
    data.store?.phone ? `Phone: ${data.store.phone}` : null,
    data.store?.email ? `Email: ${data.store.email}` : null,
  ].filter(Boolean);

  for (const line of fromLines) {
    doc.text(line, startX, fromY, { width: fromWidth, lineGap: 2 });
    const lineHeight = doc.heightOfString(line, { width: fromWidth, lineGap: 2 });
    fromY += lineHeight + 4;
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('ORDER RECEIPT', orderColumnX, startY, { width: orderWidth });
  let orderY = startY + 18;

  const orderDetails = [
    data.orderNumber ? `Order #: ${data.orderNumber}` : null,
    data.date ? `Date: ${new Date(data.date).toLocaleDateString('en-IN')}` : null,
    data.payment?.method ? `Payment: ${String(data.payment.method).toUpperCase()}` : null,
    data.payment?.status ? `Status: ${String(data.payment.status).toUpperCase()}` : null,
  ].filter(Boolean);

  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  for (const line of orderDetails) {
    doc.text(line, orderColumnX, orderY, { width: orderWidth, lineGap: 2 });
    const lineHeight = doc.heightOfString(line, { width: orderWidth, lineGap: 2 });
    orderY += lineHeight + 5;
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('TO:', toColumnX, startY, { width: toWidth });
  let toY = startY + 18;
  doc.font('Helvetica').fontSize(9).fillColor('#333333');

  const printToLine = (text, options = {}) => {
    if (!text) return;
    const fontSize = options.fontSize || 9;
    const bold = options.bold || false;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    doc.text(text, toColumnX, toY, { width: toWidth, lineGap: 2, align: 'left' });
    const lineHeight = doc.heightOfString(text, { width: toWidth, lineGap: 2 });
    toY += lineHeight + 4;
  };

  if (data.customer?.name) {
    printToLine(data.customer.name, { bold: true, fontSize: 9 });
  }



  if (data.shippingAddress) {
    if (data.shippingAddress.street) printToLine(data.shippingAddress.street);
    if (data.shippingAddress.city) printToLine(data.shippingAddress.city);
    if (data.shippingAddress.state) printToLine(data.shippingAddress.state);
    if (data.shippingAddress.postalCode) printToLine(data.shippingAddress.postalCode);
    if (data.shippingAddress.country) printToLine(data.shippingAddress.country);
    if (data.shippingAddress.phone) printToLine(`Phone: ${data.shippingAddress.phone}`);
    if (data.shippingAddress.email) printToLine(`Email: ${data.shippingAddress.email}`);
  }

  const maxColumnHeight = Math.max(fromY, orderY, toY);
  doc.y = maxColumnHeight + 20;
};

const addPDFItemsTable = (doc, data) => {
  const tableTop = doc.y + 10;
  doc.font('Helvetica-Bold').fontSize(9)
     .text('PRODUCT', 50, tableTop)
     .text('QTY', 200, tableTop)
     .text('WEIGHT', 260, tableTop)
     .text('PRICE', 350, tableTop)
     .text('TOTAL', 450, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
  let yPosition = tableTop + 25;
  data.items.forEach((item) => {
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 60;
    if (yPosition > bottomLimit) { doc.addPage(); yPosition = 50; }
    const weightDisplay = item.weight && item.weight > 0
      ? `${item.weight}${item.weightUnit === 'gram' ? 'g' : item.weightUnit === 'kg' ? 'kg' : item.weightUnit}`
      : '-';
    doc.font('Helvetica').fontSize(8)
       .text(item.name, 50, yPosition, { width: 140 })
       .text(item.quantity.toString(), 200, yPosition)
       .text(weightDisplay, 260, yPosition)
       .text(`${item.price}`, 350, yPosition)
       .text(`${item.total}`, 450, yPosition);
    yPosition += 18;
    doc.fillColor('#000');
  });
  doc.y = yPosition + 10;
};

const addPDFTotals = (doc, data) => {
  const totalsTop = doc.y + 10;
  doc.font('Helvetica').fontSize(9)
     .text(`Subtotal: ${data.pricing.subtotal.toFixed(2)}`, 400, totalsTop)
     .text(`Tax: ${data.pricing.tax.toFixed(2)}`, 400, totalsTop + 14)
     .text(`Shipping: ${data.pricing.shipping.toFixed(2)}`, 400, totalsTop + 28);
  doc.moveTo(400, totalsTop + 42).lineTo(520, totalsTop + 42).stroke();
  doc.font('Helvetica-Bold').fontSize(10)
     .text(`TOTAL: ${data.pricing.total.toFixed(2)}`, 400, totalsTop + 50);
  doc.y = totalsTop + 65;
};

const addPDFFooter = (doc) => {
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 30;
  if (doc.y < bottomLimit) doc.moveDown(2);
  doc.fontSize(8).fillColor('#666666').text('', {
    align: 'center',
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right
  });
};

export const updateOrderStatusByOrderId = async (request, reply) => {
  try {
    const { orderStatus } = request.body;
    const { orderId } = request.params;
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });

    const order = await Order.findOne({ orderId });
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });

    const oldStatus = order.orderStatus;
    order.orderStatus = orderStatus;

    if (orderStatus === 'delivered') {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cod') order.paymentStatus = 'completed';
    }
    if (orderStatus === 'cancelled' && oldStatus !== 'cancelled') {
      order.cancelledAt = new Date();
      await restoreProductStock(order.products);
      order.deliveryStatus = 'unassigned';
      order.deliveryBoy = null;
      order.deliveryAssignedAt = null;
      order.deliveryPickedUpAt = null;
      order.deliveryDeliveredAt = null;
    }

    await order.save();

    const customerEmail = order.shippingAddress?.email;
    const customerName = order.name || order.shippingAddress?.name || 'Customer';
    const customerPhone = order.shippingAddress?.phone;

    if (customerEmail) {
      try { await sendOrderStatusUpdateEmail(order, { email: customerEmail, name: customerName }, oldStatus, orderStatus); } catch (e) { console.error(e); }
    }
    if (customerPhone) {
      try { await sendOrderStatusSMS(customerPhone, order, orderStatus); } catch (e) { console.error(e); }
    }

    return reply.status(200).send({
      success: true, message: `Status updated`,
      order: {
        orderId: order.orderId, name: order.name, orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus, paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt, cancelledAt: order.cancelledAt
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const cancelOrder = async (request, reply) => {
  try {
    const { id } = request.params;
    const { cancellationReason } = request.body;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';

    const order = await Order.findById(id);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });

    const isOrderOwner = order.user && order.user.toString() === userId;
    if (!isOrderOwner && !isAdmin) return reply.status(403).send({ success: false, message: 'Not authorized' });
    if (order.orderStatus === 'cancelled') return reply.status(400).send({ success: false, message: 'Already cancelled' });

    const cancellableStatuses = ['pending', 'confirmed', 'processing'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return reply.status(400).send({ success: false, message: `Cannot cancel order already ${order.orderStatus}` });
    }

    order.orderStatus = 'cancelled';
    order.cancelledAt = new Date();
    order.deliveryStatus = 'unassigned';
    order.deliveryBoy = null;
    order.deliveryAssignedAt = null;
    if (cancellationReason) order.cancellationReason = cancellationReason;

    await restoreProductStock(order.products);
    await order.save();

    const customerEmail = order.shippingAddress?.email;
    const customerName = order.name || order.shippingAddress?.name || 'Customer';
    const customerPhone = order.shippingAddress?.phone;

    if (customerEmail) {
      try { await sendOrderCancellationEmail(order, { email: customerEmail, name: customerName }, cancellationReason, isAdmin ? 'admin' : 'user'); } catch (e) { console.error(e); }
    }
    if (customerPhone) {
      try { await sendOrderCancellationSMS(customerPhone, order, cancellationReason); } catch (e) { console.error(e); }
    }

    return reply.status(200).send({
      success: true, message: 'Order cancelled',
      order: {
        _id: order._id, orderId: order.orderId, name: order.name, orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus, deliveryBoy: order.deliveryBoy,
        cancelledAt: order.cancelledAt, cancellationReason: order.cancellationReason
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const deleteOrder = async (request, reply) => {
  try {
    const { id } = request.params;
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });
    const order = await Order.findById(id);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    await order.deleteOne();
    return reply.status(200).send({ success: true, message: 'Order deleted' });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const updateOrderPaymentFailed = async (request, reply) => {
  try {
    const { orderId } = request.body;
    if (!orderId) return reply.status(400).send({ success: false, message: 'Order ID required' });
    const order = await Order.findOne({ orderId });
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
    order.deliveryBoy = null;
    order.deliveryStatus = 'unassigned';
    await order.save();
    return reply.status(200).send({ success: true, message: 'Payment marked failed', order });
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};

export const getOrderByRazorpayOrderId = async (request, reply) => {
  try {
    const { razorpayOrderId } = request.params;
    if (!razorpayOrderId) return reply.code(400).send({ success: false, message: 'Razorpay order ID required' });
    const order = await Order.findOne({ razorpayOrderId }).lean();
    if (!order) return reply.code(404).send({ success: false, message: 'Order not found' });
    return reply.code(200).send({ success: true, order });
  } catch (error) {
    return reply.code(500).send({ success: false, message: error.message });
  }
};

export const processRefund = async (request, reply) => {
  try {
    const { id } = request.params;
    const { amount, reason } = request.body;
    if (request.user.role !== 'admin') return reply.status(403).send({ success: false, message: 'Admin only' });

    const order = await Order.findById(id);
    if (!order) return reply.status(404).send({ success: false, message: 'Order not found' });
    if (order.refundStatus === 'completed') return reply.status(400).send({ success: false, message: 'Already refunded' });
    if (order.paymentMethod !== 'razorpay') return reply.status(400).send({ success: false, message: 'Only Razorpay refunds' });
    if (order.paymentStatus !== 'completed') return reply.status(400).send({ success: false, message: 'Payment not completed' });
    if (!order.paymentId) return reply.status(400).send({ success: false, message: 'No payment ID' });

    const refundAmount = amount || order.finalAmount;
    const refundAmountInPaise = Math.round(refundAmount * 100);

    try {
      const settings = await getStoreSettings();
      if (!settings.razorpayKeyId || !settings.razorpayKeySecret) throw new Error('Razorpay keys not configured');

      const Razorpay = await import('razorpay');
      const razorpay = new Razorpay.default({ key_id: settings.razorpayKeyId, key_secret: settings.razorpayKeySecret });

      const refund = await razorpay.payments.refund(order.paymentId, {
        amount: refundAmountInPaise, speed: 'normal',
        notes: { orderId: order.orderId, reason: reason || 'Admin refund' }
      });

      order.refundStatus = 'completed';
      order.refundMessage = `Refund ID: ${refund.id}`;
      order.refundedAt = new Date();
      order.paymentStatus = 'refunded';
      await order.save();

      const customerEmail = order.shippingAddress?.email;
      const customerPhone = order.shippingAddress?.phone;
      const customerName = order.name || order.shippingAddress?.name || 'Customer';

      if (customerEmail) {
        try { await sendOrderRefundEmail(order, { email: customerEmail, name: customerName }, refundAmount, reason); } catch (e) { console.error(e); }
      }
      if (customerPhone) {
        try { await sendOrderRefundSMS(customerPhone, order, refundAmount, reason); } catch (e) { console.error(e); }
      }

      return reply.status(200).send({ success: true, message: 'Refund processed', refund: { id: refund.id, amount: refundAmount, status: refund.status, createdAt: refund.created_at } });
    } catch (refundError) {
      console.error('Refund failed:', refundError);
      if (refundError.error && refundError.error.description === 'The payment has been fully refunded already') {
        order.refundStatus = 'completed';
        order.refundMessage = 'Already refunded on Razorpay';
        order.refundedAt = new Date();
        order.paymentStatus = 'refunded';
        await order.save();
        return reply.status(200).send({ success: true, message: 'Already refunded', alreadyRefunded: true });
      }
      order.refundStatus = 'failed';
      order.refundMessage = `Refund failed: ${refundError.message}`;
      await order.save();
      return reply.status(500).send({ success: false, message: 'Refund failed', error: refundError.message });
    }
  } catch (error) {
    return reply.status(500).send({ success: false, message: error.message });
  }
};