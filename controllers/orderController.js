import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/productModel.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ward data
let wardsData = null;
let streetToWardMap = new Map();

try {
  const wardFilePath = path.join(__dirname, '../data/Karaikudi_Wards.json');
  if (fs.existsSync(wardFilePath)) {
    wardsData = JSON.parse(fs.readFileSync(wardFilePath, 'utf8'));
    console.log(`✅ Loaded ${wardsData.wards.length} wards from Karaikudi_Wards.json`);
    
    for (const ward of wardsData.wards) {
      for (const street of ward.streets) {
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
    console.log(`✅ Built street mapping with ${streetToWardMap.size} unique streets`);
  } else {
    console.warn('⚠️ Karaikudi_Wards.json not found, ward validation disabled');
  }
} catch (error) {
  console.error('❌ Error loading ward data:', error.message);
}

// Helper: Extract core street name
const extractCoreStreetName = (street) => {
  let cleaned = street.toLowerCase().trim();
  cleaned = cleaned.replace(/^\d+\s+/, '');
  cleaned = cleaned.replace(/^(no\.?|near|opp|behind|next to|beside|at|in)\s+/i, '');
  cleaned = cleaned.replace(/\s+(street|road|st|rd|nagar|colony|lane|sanctuary|area)$/i, '');
  cleaned = cleaned.replace(/\s+(vadaku|thenvadal|kilamel|melpagam|kilpagam)$/i, '');
  return cleaned.trim();
};

// Helper: Check if coordinates are within a polygon
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

// Helper: Find ward by coordinates
const findWardByCoordinates = (lat, lon) => {
  if (!wardsData || !wardsData.wards) return null;
  for (const ward of wardsData.wards) {
    if (ward.polygon && isPointInPolygon(lat, lon, ward.polygon)) {
      return {
        wardId: ward.wardId,
        wardName: ward.wardName,
        deliveryZone: 'standard'
      };
    }
  }
  return null;
};

// Helper: EXACT street name match
const findWardByExactStreetMatch = (streetName) => {
  if (!streetToWardMap.size) return null;
  const normalizedInput = streetName.toLowerCase().trim();
  if (streetToWardMap.has(normalizedInput)) {
    const ward = streetToWardMap.get(normalizedInput);
    console.log(`✅ EXACT match: "${streetName}" → Ward ${ward.wardId}: ${ward.wardName}`);
    return ward;
  }
  return null;
};

// Helper: CORE street name match
const findWardByCoreStreetName = (streetName) => {
  if (!wardsData || !wardsData.wards) return null;
  const coreName = extractCoreStreetName(streetName);
  console.log(`🔍 Extracted core: "${coreName}" from "${streetName}"`);
  if (coreName.length < 3) return null;
  
  for (const ward of wardsData.wards) {
    for (const street of ward.streets) {
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

// Helper: Keyword priority match
const findWardByKeyword = (address) => {
  if (!wardsData || !wardsData.wards) return null;
  const streetLower = address.street.toLowerCase();
  
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
      const ward = wardsData.wards.find(w => w.wardId === targetWardId);
      if (ward) {
        console.log(`✅ KEYWORD match: "${keyword}" → Ward ${targetWardId}: ${ward.wardName}`);
        return { wardId: ward.wardId, wardName: ward.wardName, deliveryZone: 'standard' };
      }
    }
  }
  return null;
};

// Helper: Geocode address
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

// Helper: Update product stock - ONLY if variant is specified
const updateProductStock = async (products) => {
  console.log(`\n📦 Starting stock update for ${products.length} items...`);
  
  for (const item of products) {
    console.log(`\n--- Processing: ${item.name} ---`);
    console.log(`  Quantity: ${item.quantity}`);
    console.log(`  variantId: ${item.variantId || 'NOT PROVIDED'}`);
    console.log(`  variantName: ${item.variantName || 'NOT PROVIDED'}`);
    
    // CRITICAL: Skip if no variant information
    if (!item.variantId && !item.variantName) {
      console.log(`❌ SKIPPED: No variant specified for "${item.name}". Stock NOT reduced.`);
      continue;
    }
    
    const product = await Product.findById(item.product);
    if (!product) {
      console.log(`❌ Product not found: ${item.product}`);
      continue;
    }
    
    console.log(`✅ Product found: ${product.name}`);
    
    // Check if product has variants
    if (!product.variants || product.variants.length === 0) {
      console.log(`⚠️ Product has no variants, but variant was specified. Stock NOT reduced.`);
      continue;
    }
    
    let variantFound = false;
    let variantIndex = -1;
    
    // Try to find variant by ID
    if (item.variantId && item.variantId !== '' && item.variantId !== 'null') {
      variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
      if (variantIndex !== -1) {
        console.log(`✅ Found variant by ID: ${product.variants[variantIndex].variantName}`);
        variantFound = true;
      }
    }
    
    // Try to find variant by name (if not found by ID)
    if (!variantFound && item.variantName && item.variantName !== '') {
      variantIndex = product.variants.findIndex(v => v.variantName === item.variantName);
      if (variantIndex !== -1) {
        console.log(`✅ Found variant by name: ${product.variants[variantIndex].variantName}`);
        variantFound = true;
      }
    }
    
    if (!variantFound) {
      console.log(`❌ SKIPPED: Variant not found for "${item.name}". Stock NOT reduced.`);
      continue;
    }
    
    // Update variant stock
    const oldVariantStock = product.variants[variantIndex].stock;
    product.variants[variantIndex].stock -= item.quantity;
    
    // Recalculate total product stock
    const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    product.stock = totalStock;
    
    await product.save();
    
    console.log(`✅ Stock reduced!`);
    console.log(`   Variant: ${product.variants[variantIndex].variantName}`);
    console.log(`   Old stock: ${oldVariantStock} → New stock: ${product.variants[variantIndex].stock}`);
    console.log(`   Total product stock: ${totalStock}`);
  }
  
  console.log(`\n📦 Stock update completed\n`);
};

// Helper: Validate delivery area
const isDeliverableArea = (city) => {
  const deliverableCities = ['karaikudi', 'karaikudi.', 'karaikudi,', 'karaikudi '];
  return deliverableCities.some(deliverableCity => 
    city.toLowerCase().includes(deliverableCity)
  );
};

// Main: Create Order
export const createOrder = async (request, reply) => {
  try {
    const userId = request.user.userId || request.user.id;
    const { shippingAddress, paymentMethod, paymentId } = request.body;
    
    // Validate required fields
    if (!shippingAddress || !paymentMethod) {
      return reply.status(400).send({
        success: false,
        message: 'Shipping address and payment method are required'
      });
    }
    
    const requiredFields = ['street', 'city', 'state', 'postalCode', 'country', 'phone'];
    for (const field of requiredFields) {
      if (!shippingAddress[field]) {
        return reply.status(400).send({
          success: false,
          message: `Shipping address field '${field}' is required`
        });
      }
    }
    
    // DELIVERY AREA VALIDATION
    if (!isDeliverableArea(shippingAddress.city)) {
      console.log(`❌ Order REJECTED: "${shippingAddress.city}" is not in delivery area`);
      return reply.status(400).send({
        success: false,
        message: `Delivery not available in "${shippingAddress.city}". We currently deliver only to Karaikudi and surrounding areas.`
      });
    }
    
    // Get user's cart
    const cart = await Cart.findOne({ user: userId })
      .populate('items.product');
    
    if (!cart || cart.items.length === 0) {
      return reply.status(400).send({
        success: false,
        message: 'Cart is empty'
      });
    }
    
    console.log(`\n🛒 Creating order for user ${userId}`);
    console.log(`📦 Cart has ${cart.items.length} items`);
    console.log(`📍 Shipping address: "${shippingAddress.street}, ${shippingAddress.city}"`);
    
 // ========== WARD MATCHING LOGIC - REQUIRED ==========
let wardInfo = { wardId: null, wardName: null, deliveryZone: 'standard' };

const exactMatch = findWardByExactStreetMatch(shippingAddress.street);
if (exactMatch) wardInfo = exactMatch;

if (!wardInfo.wardId) {
  const coreMatch = findWardByCoreStreetName(shippingAddress.street);
  if (coreMatch) wardInfo = coreMatch;
}

if (!wardInfo.wardId) {
  const keywordMatch = findWardByKeyword(shippingAddress);
  if (keywordMatch) wardInfo = keywordMatch;
}

if (!wardInfo.wardId) {
  const coordinates = await geocodeAddress(shippingAddress);
  if (coordinates) {
    const foundWard = findWardByCoordinates(coordinates.lat, coordinates.lng);
    if (foundWard) wardInfo = foundWard;
  }
}

// ✅ NEW: REJECT order if no ward match found
if (!wardInfo.wardId) {
  console.log(`❌ Order REJECTED: Street "${shippingAddress.street}" not found in Karaikudi wards`);
  return reply.status(400).send({
    success: false,
    code: 'STREET_NOT_FOUND',
    message: `We couldn't verify your address "${shippingAddress.street}". Please enter a valid street name in Karaikudi.`
  });
}

console.log(`✅ Ward assigned: ${wardInfo.wardId} - ${wardInfo.wardName}`);
    
    // Process cart items
    let totalAmount = 0;
    const products = [];
    
    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);
      
      if (!product) {
        return reply.status(404).send({
          success: false,
          message: `Product not found`
        });
      }
      
      console.log(`\n--- Processing cart item: ${product.name} ---`);
      console.log(`  Cart variantId: ${item.variantId || 'NOT SET'}`);
      console.log(`  Cart variantName: ${item.variantName || 'NOT SET'}`);
      
      // Check if product has variants
      if (product.variants && product.variants.length > 0) {
        // Product HAS variants - variant MUST be specified
        const hasVariant = (item.variantId && item.variantId !== '' && item.variantId !== 'null') || 
                          (item.variantName && item.variantName !== '');
        
        if (!hasVariant) {
          console.log(`❌ ERROR: Product "${product.name}" has variants but no variant selected`);
          return reply.status(400).send({
            success: false,
            message: `Please select a variant for ${product.name}`
          });
        }
        
        // Find the variant to check stock
        let variant = null;
        if (item.variantId && item.variantId !== '' && item.variantId !== 'null') {
          variant = product.variants.find(v => v._id.toString() === item.variantId);
        } else if (item.variantName && item.variantName !== '') {
          variant = product.variants.find(v => v.variantName === item.variantName);
        }
        
        if (!variant) {
          console.log(`❌ ERROR: Variant not found for product "${product.name}"`);
          return reply.status(400).send({
            success: false,
            message: `Variant not found for ${product.name}`
          });
        }
        
        // Check variant stock
        if (variant.stock < item.quantity) {
          console.log(`❌ ERROR: Insufficient stock for ${product.name} - ${variant.variantName}`);
          return reply.status(400).send({
            success: false,
            message: `Insufficient stock for ${product.name} - ${variant.variantName}. Only ${variant.stock} left.`
          });
        }
        
        console.log(`✅ Variant found: ${variant.variantName}, Stock: ${variant.stock}`);
        
      } else {
        // Product has NO variants - check product stock directly
        if (product.stock < item.quantity) {
          console.log(`❌ ERROR: Insufficient stock for ${product.name}`);
          return reply.status(400).send({
            success: false,
            message: `Insufficient stock for ${product.name}. Only ${product.stock} left.`
          });
        }
        console.log(`✅ No variants, product stock: ${product.stock}`);
      }
      
      const itemPrice = item.price || product.basePrice;
      const itemTotal = item.quantity * itemPrice;
      totalAmount += itemTotal;
      
      const productImage = product.images && product.images.length > 0 
        ? product.images[0].image 
        : product.ogImage || null;
      
      let discountPercentage = 0;
      let originalPrice = item.originalPrice || itemPrice;
      if (originalPrice > itemPrice) {
        discountPercentage = Math.round(((originalPrice - itemPrice) / originalPrice) * 100);
      }
      
      products.push({
        product: product._id,
        variantId: item.variantId || null,
        variantName: item.variantName || '',
        quantity: item.quantity,
        price: itemPrice,
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
        name: product.name,
        image: productImage
      });
      
      console.log(`  ✅ Added to order: ${item.quantity} x ₹${itemPrice} = ₹${itemTotal}`);
    }
    
    // Calculate totals
    const shippingFee = 0;
    const taxAmount = Math.round((totalAmount * 5) / 100);
    const discountAmount = products.reduce((sum, item) => {
      if (item.originalPrice > item.price) {
        return sum + ((item.originalPrice - item.price) * item.quantity);
      }
      return sum;
    }, 0);
    const finalAmount = totalAmount + shippingFee + taxAmount;
    
    console.log(`\n💰 Order totals:`);
    console.log(`   Subtotal: ₹${totalAmount}`);
    console.log(`   Tax (5%): ₹${taxAmount}`);
    console.log(`   Final: ₹${finalAmount}`);
    
    // Create order
    const order = await Order.create({
      user: userId,
      products,
      shippingAddress,
      wardId: wardInfo.wardId,
      wardName: wardInfo.wardName,
      deliveryZone: wardInfo.deliveryZone,
      paymentMethod,
      paymentId: paymentMethod !== 'cod' ? paymentId : undefined,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
      orderStatus: paymentMethod === 'cod' ? 'confirmed' : 'pending',
      totalAmount: Number(totalAmount.toFixed(2)),
      shippingFee: Number(shippingFee.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      finalAmount: Number(finalAmount.toFixed(2))
    });
    
    console.log(`\n✅ Order created: ${order.orderId} (sNo: ${order.sNo})`);
    
    // Update stock for COD orders
    if (paymentMethod === 'cod') {
      console.log(`\n📦 Updating stock for COD order...`);
      await updateProductStock(products);
      order.orderStatus = 'confirmed';
      await order.save();
    }
    
    // Clear cart
    await Cart.findOneAndUpdate(
      { user: userId }, 
      { $set: { items: [], totalItems: 0, totalPrice: 0, totalOriginalPrice: 0, totalSavings: 0 } }
    );
    
    console.log(`🗑️ Cart cleared for user ${userId}\n`);
    
    return reply.status(201).send({
      success: true,
      message: 'Order created successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        sNo: order.sNo,
        products: order.products,
        shippingAddress: order.shippingAddress,
        wardId: order.wardId,
        wardName: order.wardName,
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
    return reply.status(500).send({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get user's orders
export const getUserOrders = async (request, reply) => {
  try {
    const userId = request.user.userId || request.user.id;
    const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
    return reply.status(200).send({ success: true, orders });
  } catch (error) {
    console.error('Get user orders error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// Get single order by ID
export const getOrderById = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';
    
    const order = await Order.findById(id);
    
    if (!order) {
      return reply.status(404).send({ success: false, message: 'Order not found' });
    }
    
    if (order.user.toString() !== userId && !isAdmin) {
      return reply.status(403).send({ success: false, message: 'Unauthorized to view this order' });
    }
    
    return reply.status(200).send({ success: true, order });
  } catch (error) {
    console.error('Get order by ID error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};