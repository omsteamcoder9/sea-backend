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
  sendOrderCancellationEmail ,
  sendOrderRefundEmail ,
   

} from '../services/emailService.js';
import { 
  sendOrderConfirmationSMS, 
  sendOrderStatusSMS, 
  sendOrderCancellationSMS ,
    sendOrderRefundSMS      

} from '../services/smsService.js';

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

// Helper: Get dynamic store settings
let cachedSettings = null;
let settingsCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    console.error('Error fetching settings for receipt:', error);
    return {
      siteName: '',
      contactEmail: 'contact@example.com',
      contactNumber: '+91 98765 43210',
      companyAddress: 'Ganga Enterprise, 2nd Floor, Spencer Plaza, Anna Salai, Chennai',
      socialMedia: {},
      razorpayKeyId: '',
      razorpayKeySecret: ''
    };
  }
};

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

// Helper: Update product stock
const updateProductStock = async (products) => {
  console.log(`\n📦 Starting stock update for ${products.length} items...`);
  
  for (const item of products) {
    console.log(`\n--- Processing: ${item.name} ---`);
    console.log(`  Quantity: ${item.quantity}`);
    console.log(`  variantId: ${item.variantId || 'NOT PROVIDED'}`);
    console.log(`  variantName: ${item.variantName || 'NOT PROVIDED'}`);
    
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
    
    if (!product.variants || product.variants.length === 0) {
      console.log(`⚠️ Product has no variants, but variant was specified. Stock NOT reduced.`);
      continue;
    }
    
    let variantFound = false;
    let variantIndex = -1;
    
    if (item.variantId && item.variantId !== '' && item.variantId !== 'null') {
      variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
      if (variantIndex !== -1) {
        console.log(`✅ Found variant by ID: ${product.variants[variantIndex].variantName}`);
        variantFound = true;
      }
    }
    
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
    
    const oldVariantStock = product.variants[variantIndex].stock;
    product.variants[variantIndex].stock -= item.quantity;
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

// Helper: Restore product stock
const restoreProductStock = async (products) => {
  for (const item of products) {
    if (item.variantId) {
      const product = await Product.findById(item.product);
      if (product && product.variants) {
        const variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
        if (variantIndex !== -1) {
          product.variants[variantIndex].stock += item.quantity;
          const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
          product.stock = totalStock;
          await product.save();
        }
      }
    }
  }
};

// Helper: Validate delivery area
const isDeliverableArea = (city) => {
  const deliverableCities = ['karaikudi', 'karaikudi.', 'karaikudi,', 'karaikudi '];
  return deliverableCities.some(deliverableCity => 
    city.toLowerCase().includes(deliverableCity)
  );
};

// ========== CREATE ORDER ==========
// ========== CREATE ORDER ==========
export const createOrder = async (request, reply) => {
  try {
    const userId = request.user.userId || request.user.id;
    const { shippingAddress, paymentMethod, paymentId, skipCartClear, products: bodyProducts } = request.body;
    
    if (!shippingAddress || !paymentMethod) {
      return reply.status(400).send({
        success: false,
        message: 'Shipping address and payment method are required'
      });
    }
    
    const requiredFields = ['street', 'city', 'state', 'postalCode', 'country', 'phone', 'email'];
    for (const field of requiredFields) {
      if (!shippingAddress[field]) {
        return reply.status(400).send({
          success: false,
          message: `Shipping address field '${field}' is required`
        });
      }
    }
    
    if (!isDeliverableArea(shippingAddress.city)) {
      console.log(`❌ Order REJECTED: "${shippingAddress.city}" is not in delivery area`);
      return reply.status(400).send({
        success: false,
        message: `Delivery not available in "${shippingAddress.city}". We currently deliver only to Karaikudi and surrounding areas.`
      });
    }
    
    let totalAmount = 0;
    let products = [];
    
    // ✅ FIX: If skipCartClear is true (Buy Now mode), use products from request body
    if (skipCartClear && bodyProducts && bodyProducts.length > 0) {
      console.log(`🛒 Buy Now mode - Using ${bodyProducts.length} products from request body`);
      
      for (const item of bodyProducts) {
        const product = await Product.findById(item.product);
        
        if (!product) {
          return reply.status(404).send({
            success: false,
            message: `Product not found: ${item.product}`
          });
        }
        
        const price = item.price;
        const variantId = item.variantId;
        const variantName = item.variantName || '';
        
        let variant = null;
        let originalPrice = price;
        
        if (variantId && product.variants && product.variants.length > 0) {
          variant = product.variants.find(v => v._id.toString() === variantId);
          if (variant) {
            originalPrice = variant.originalPrice || variant.price || price;
          }
        }
        
        // Check stock
        if (variant) {
          if (variant.stock < item.quantity) {
            return reply.status(400).send({
              success: false,
              message: `Insufficient stock for ${product.name} - ${variantName}`
            });
          }
        } else if (product.stock < item.quantity) {
          return reply.status(400).send({
            success: false,
            message: `Insufficient stock for ${product.name}`
          });
        }
        
        const itemTotal = item.quantity * price;
        totalAmount += itemTotal;
        
        let discountPercentage = 0;
        if (originalPrice > price) {
          discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);
        }
        
        const productImage = product.images && product.images.length > 0 
          ? product.images[0].image 
          : product.ogImage || null;
        
        products.push({
          product: product._id,
          variantId: variantId,
          variantName: variantName,
          quantity: item.quantity,
          price: price,
          originalPrice: originalPrice,
          discountPercentage: discountPercentage,
          name: product.name,
          image: productImage,
          weight: item.weight || 0,
          weightUnit: item.weightUnit || 'gram'
        });
        
        console.log(`  ✅ Buy Now product added: ${product.name} x ${item.quantity} = ${itemTotal}`);
      }
    } else {
      // ❌ NORMAL CHECKOUT - Use cart from database
      console.log(`🛒 Normal checkout - Using cart from database`);
      
      const cart = await Cart.findOne({ user: userId }).populate('items.product');
      
      if (!cart || cart.items.length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Cart is empty'
        });
      }
      
      console.log(`📦 Cart has ${cart.items.length} items`);
      console.log(`📍 Shipping address: "${shippingAddress.street}, ${shippingAddress.city}"`);
      
      // Ward matching
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
        
        let itemWeight = item.weight || 0;
        let itemWeightUnit = item.weightUnit || 'gram';
        
        if (product.variants && product.variants.length > 0) {
          const hasVariant = (item.variantId && item.variantId !== '' && item.variantId !== 'null') || 
                            (item.variantName && item.variantName !== '');
          
          if (!hasVariant) {
            console.log(`❌ ERROR: Product "${product.name}" has variants but no variant selected`);
            return reply.status(400).send({
              success: false,
              message: `Please select a variant for ${product.name}`
            });
          }
          
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
          
          if (variant.stock < item.quantity) {
            console.log(`❌ ERROR: Insufficient stock for ${product.name} - ${variant.variantName}`);
            return reply.status(400).send({
              success: false,
              message: `Insufficient stock for ${product.name} - ${variant.variantName}. Only ${variant.stock} left.`
            });
          }
          
          if (!itemWeight && variant.weight) {
            itemWeight = variant.weight;
            itemWeightUnit = variant.weightUnit || 'gram';
          }
          
          console.log(`✅ Variant found: ${variant.variantName}, Stock: ${variant.stock}, Weight: ${itemWeight} ${itemWeightUnit}`);
          
        } else {
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
          image: productImage,
          weight: itemWeight,
          weightUnit: itemWeightUnit
        });
        
        console.log(`  ✅ Added to order: ${item.quantity} x ${itemPrice} = ${itemTotal} (Weight: ${itemWeight} ${itemWeightUnit})`);
      }
    }
    
    // Validate totalAmount
    if (isNaN(totalAmount) || totalAmount <= 0) {
      console.error('❌ Invalid total amount calculated:', totalAmount);
      return reply.status(400).send({
        success: false,
        message: 'Invalid order total calculated'
      });
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
    
    console.log(`\n💰 Order totals:`);
    console.log(`   Subtotal: ${totalAmount}`);
    console.log(`   Tax (5%): ${taxAmount}`);
    console.log(`   Final: ${finalAmount}`);
    
    // ========== ✅ FIXED: ALWAYS do ward matching for ALL orders (both Cart and Buy Now) ==========
    let wardInfo = { wardId: null, wardName: null, deliveryZone: 'standard' };
    
    const exactMatch = findWardByExactStreetMatch(shippingAddress.street);
    if (exactMatch) wardInfo = exactMatch;
    else {
      const coreMatch = findWardByCoreStreetName(shippingAddress.street);
      if (coreMatch) wardInfo = coreMatch;
      else {
        const keywordMatch = findWardByKeyword(shippingAddress);
        if (keywordMatch) wardInfo = keywordMatch;
        else {
          const coordinates = await geocodeAddress(shippingAddress);
          if (coordinates) {
            const foundWard = findWardByCoordinates(coordinates.lat, coordinates.lng);
            if (foundWard) wardInfo = foundWard;
          }
        }
      }
    }

    if (!wardInfo.wardId) {
      console.log(`❌ Order REJECTED: Street "${shippingAddress.street}" not found in Karaikudi wards`);
      return reply.status(400).send({
        success: false,
        code: 'STREET_NOT_FOUND',
        message: `We couldn't verify your address "${shippingAddress.street}". Please enter a valid street name in Karaikudi.`
      });
    }

    console.log(`✅ Ward assigned: ${wardInfo.wardId} - ${wardInfo.wardName}`);
    
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
    
    // ========== AUTO-ASSIGN DELIVERY BOY BASED ON WARD ==========
    if (order.wardId) {
      try {
        const DeliveryBoy = (await import('../models/DeliveryBoy.js')).default;
        const deliveryBoy = await DeliveryBoy.findOne({ 
          wardIds: { $in: [order.wardId] },
          status: 'active' 
        });
        
        if (deliveryBoy) {
          order.deliveryBoy = deliveryBoy._id;
          order.deliveryStatus = 'assigned';
          order.deliveryAssignedAt = new Date();
          await order.save();
          console.log(`✅ Order ${order.orderId} auto-assigned to: ${deliveryBoy.name} (Ward ${order.wardId})`);
        } else {
          console.log(`⚠️ No active delivery boy found for Ward ${order.wardId}`);
        }
      } catch (err) {
        console.error('Auto-assign error:', err.message);
      }
    }
    
    // Update stock for COD orders
    if (paymentMethod === 'cod') {
      console.log(`\n📦 Updating stock for COD order...`);
      await updateProductStock(products);
      order.orderStatus = 'confirmed';
      await order.save();
    }
    
    // ✅ FIX: Only clear cart if NOT in Buy Now mode (skipCartClear is false or undefined)
    if (!skipCartClear) {
      await Cart.findOneAndUpdate(
        { user: userId }, 
        { $set: { items: [], totalItems: 0, totalPrice: 0, totalOriginalPrice: 0, totalSavings: 0 } }
      );
      console.log(`🗑️ Cart cleared for user ${userId} (normal checkout)`);
    } else {
      console.log(`🛒 Buy Now mode - Cart NOT cleared for user ${userId} (cart preserved)`);
    }
    
    // ========== SEND NOTIFICATIONS - ONLY FOR COD ==========
    if (paymentMethod === 'cod') {
      const customerEmail = shippingAddress.email;
      const customerName = shippingAddress.name || 'Customer';
      const customerPhone = shippingAddress.phone;
      
      try {
        await sendOrderConfirmationEmail(order, { email: customerEmail, name: customerName });
        console.log(`📧 Order confirmation email sent to ${customerEmail} (COD)`);
      } catch (emailError) {
        console.error('Failed to send order confirmation email:', emailError);
      }
      
      try {
        if (customerPhone) {
          await sendOrderConfirmationSMS(customerPhone, order);
          console.log(`📱 Order confirmation SMS sent to ${customerPhone} (COD)`);
        }
      } catch (smsError) {
        console.error('Failed to send order confirmation SMS:', smsError);
      }
    }
    // For Razorpay orders - NO email here, will be sent after payment success
    
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

// ========== UPDATE ORDER PAYMENT SUCCESS (RAZORPAY WEBHOOK) ==========
export const updateOrderPaymentSuccess = async (request, reply) => {
  try {
    const { orderId, paymentId } = request.body;

    console.log('🔔 Payment success webhook received:', { orderId, paymentId });

    if (!orderId || !paymentId) {
      return reply.status(400).send({
        success: false,
        message: 'Order ID and Payment ID are required'
      });
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      console.error(`❌ Order not found: ${orderId}`);
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    console.log(`✅ Order found: ${order.orderId}, current paymentStatus: ${order.paymentStatus}`);

    if (order.paymentStatus === 'completed') {
      console.log(`ℹ️ Order ${order.orderId} already has payment completed`);
      return reply.status(200).send({
        success: true,
        message: 'Order payment already completed',
        order
      });
    }

    // Update stock for Razorpay payments
    if (order.paymentMethod === 'razorpay') {
      console.log(`📦 Updating stock for order ${order.orderId}`);
      for (const item of order.products) {
        if (item.variantId) {
          const product = await Product.findById(item.product);
          if (product && product.variants) {
            const variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
            if (variantIndex !== -1) {
              product.variants[variantIndex].stock -= item.quantity;
              const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
              product.stock = totalStock;
              await product.save();
              console.log(`  ✅ Updated stock for ${item.name} variant: -${item.quantity}`);
            }
          }
        }
      }
    }

    // Update order status
    order.paymentStatus = 'completed';
    order.orderStatus = 'confirmed';
    order.paymentId = paymentId;
    order.paidAt = new Date();
    await order.save();

    console.log(`✅ Order ${order.orderId} updated: paymentStatus=completed, orderStatus=confirmed`);

    // ========== SEND ORDER CONFIRMATION EMAIL & SMS (AFTER PAYMENT SUCCESS) ==========
    const customerEmail = order.shippingAddress?.email;
    const customerPhone = order.shippingAddress?.phone;
    const customerName = order.shippingAddress?.name || order.user?.name || 'Customer';

    if (customerEmail) {
      try {
        await sendOrderConfirmationEmail(order, { email: customerEmail, name: customerName });
        console.log(`📧 Order confirmation email sent to ${customerEmail} (Payment completed)`);
      } catch (emailError) {
        console.error('❌ Failed to send order confirmation email:', emailError);
      }
    } else {
      console.warn(`⚠️ No email address found for order ${order.orderId} - email not sent`);
    }

    if (customerPhone) {
      try {
        await sendOrderConfirmationSMS(customerPhone, order);
        console.log(`📱 Order confirmation SMS sent to ${customerPhone}`);
      } catch (smsError) {
        console.error('❌ Failed to send order confirmation SMS:', smsError);
      }
    }

    return reply.status(200).send({
      success: true,
      message: 'Order payment status updated successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentId: order.paymentId,
        paidAt: order.paidAt
      }
    });

  } catch (error) {
    console.error('❌ Update order payment success error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// ========== OTHER FUNCTIONS ==========

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

// ADMIN: Get all orders
export const getAllOrders = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { status, paymentStatus, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = request.query;
    
    const filter = {};
    if (status) filter.orderStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const orders = await Order.find(filter)
      .populate('user', 'name phone')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalOrders = await Order.countDocuments(filter);
    
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
    console.error('Get all orders error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// ADMIN: Get order statistics
export const getOrderStats = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    
    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]);
    
    const ordersByPaymentStatus = await Order.aggregate([
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
    ]);
    
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name');

    return reply.status(200).send({
      success: true,
      stats: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        ordersByStatus,
        ordersByPaymentStatus,
        recentOrders
      }
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// ADMIN: Update order status
export const updateOrderStatus = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id } = request.params;
    const { orderStatus, paymentStatus, cancellationReason } = request.body;
    
    const order = await Order.findById(id);
    
    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }
    
    const oldStatus = order.orderStatus;
    
    if (orderStatus) {
      // Handle delivered status
      if (orderStatus === 'delivered' && order.orderStatus !== 'delivered') {
        order.deliveredAt = new Date();
      }
      
      // Handle cancelled status
      if (orderStatus === 'cancelled' && order.orderStatus !== 'cancelled') {
        order.cancelledAt = new Date();
        if (cancellationReason) order.cancellationReason = cancellationReason;
        await restoreProductStock(order.products);
        
        // ✅ FIX: Remove delivery boy assignment when cancelled
        order.deliveryStatus = 'unassigned';
       
        order.deliveryAssignedAt = null;
        order.deliveryPickedUpAt = null;
        order.deliveryDeliveredAt = null;
      }
      
      order.orderStatus = orderStatus;
    }
    
    if (paymentStatus) {
      if (paymentStatus === 'completed' && order.paymentStatus !== 'completed') {
        order.paidAt = new Date();
      }
      order.paymentStatus = paymentStatus;
    }
    
    await order.save();
    
    console.log(`✅ Admin updated order ${order.orderId}: status=${order.orderStatus}, payment=${order.paymentStatus}`);
    
    if (orderStatus && oldStatus !== orderStatus) {
      const customerEmail = order.shippingAddress?.email;
      const customerName = order.shippingAddress?.name || 'Customer';
      const customerPhone = order.shippingAddress?.phone;
      
      try {
        await sendOrderStatusUpdateEmail(order, { email: customerEmail, name: customerName }, oldStatus, orderStatus);
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError);
      }
      
      try {
        if (customerPhone) {
          await sendOrderStatusSMS(customerPhone, order, orderStatus);
        }
      } catch (smsError) {
        console.error('Failed to send status update SMS:', smsError);
      }
    }
    
    return reply.status(200).send({
      success: true,
      message: 'Order updated successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt
      }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};
// ADMIN: Get single order
export const getAdminOrderById = async (request, reply) => {
  try {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { id } = request.params;
    
    const order = await Order.findById(id)
      .populate('user', 'name phone')
      .populate('products.product', 'name basePrice images');
    
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
    console.error('Get admin order error:', error);
    return reply.status(500).send({ success: false, message: error.message });
  }
};

// Print order receipt (JSON) - ✅ ADDED weight display
export const printOrderReceipt = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';

    const order = await Order.findById(id)
      .populate('user', 'name')
      .populate('products.product', 'name price image');

    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    const isOrderOwner = order.user && order.user._id.toString() === userId;
    if (!isOrderOwner && !isAdmin) {
      return reply.status(403).send({
        success: false,
        message: 'Not authorized to view this receipt'
      });
    }

    const storeSettings = await getStoreSettings();

    const receiptData = {
      receiptNumber: order._id.toString(),
      orderNumber: order.orderId || order._id.toString(),
      date: order.createdAt,
      store: {
        name: storeSettings.siteName,
        email: storeSettings.contactEmail,
        phone: storeSettings.contactNumber,
        address: storeSettings.companyAddress
      },
      customer: {
        id: order.user?._id,
        name: order.user?.name || 'Customer',
      },
      shippingAddress: order.shippingAddress,
      items: order.products.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: (item.quantity * item.price).toFixed(2),
        variantName: item.variantName,
        // ✅ ADD WEIGHT
        weight: item.weight || 0,
        weightUnit: item.weightUnit || 'gram'
      })),
      pricing: {
        subtotal: order.totalAmount || 0,
        tax: order.taxAmount || 0,
        shipping: order.shippingFee || 0,
        total: order.finalAmount || 0
      },
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
        paidAt: order.paidAt
      }
    };

    return reply.status(200).send({
      success: true,
      message: 'Receipt generated successfully',
      receipt: receiptData
    });

  } catch (error) {
    console.error('Receipt generation error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error generating receipt',
      error: error.message
    });
  }
};

// Print order receipt PDF - ✅ ADDED weight column
export const printOrderReceiptPDF = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';

    const order = await Order.findById(id)
      .populate('user', 'name')
      .populate('products.product', 'name price image');

    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    const isOrderOwner = order.user && order.user._id.toString() === userId;
    if (!isOrderOwner && !isAdmin) {
      return reply.status(403).send({
        success: false,
        message: 'Not authorized to view this receipt'
      });
    }

    const storeSettings = await getStoreSettings();
    const receiptData = {
      receiptNumber: order._id.toString(),
      orderNumber: order.orderId || order._id.toString(),
      date: order.createdAt,
      store: {
        name: storeSettings.siteName,
        email: storeSettings.contactEmail,
        phone: storeSettings.contactNumber,
        address: storeSettings.companyAddress
      },
      customer: {
        name: order.user?.name || 'Customer',
      },
      shippingAddress: order.shippingAddress,
      items: order.products.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: (item.quantity * item.price).toFixed(2),
        variantName: item.variantName,
        // ✅ ADD WEIGHT
        weight: item.weight || 0,
        weightUnit: item.weightUnit || 'gram'
      })),
      pricing: {
        subtotal: order.totalAmount || 0,
        tax: order.taxAmount || 0,
        shipping: order.shippingFee || 0,
        total: order.finalAmount || 0
      },
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus
      }
    };

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="receipt-${order.orderId}.pdf"`);
    
    const pdfBuffer = await generateReceiptPDFBuffer(receiptData);
    return reply.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('PDF receipt generation error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error generating PDF receipt',
      error: error.message
    });
  }
};

// Helper function to generate PDF buffer - ✅ ADDED weight column in table
const generateReceiptPDFBuffer = async (receiptData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = await import('pdfkit').then(m => m.default);
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

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

// PDF generation helper functions
const addPDFHeader = (doc, data) => {
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor('#1a237e')
     .text(data.store.name, { align: 'center' })
     .moveDown(0.5);
  
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#666')
     .text('Order Receipt', { align: 'center' })
     .moveDown(1);
};

const addPDFCustomerInfo = (doc, data) => {
  const startX = 50;
  const startY = doc.y;
  
  doc.fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('FROM:', startX, startY);

  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9);
  doc.text(data.store.name, startX);
  
  const addressLines = data.store.address.split(',').map(line => line.trim());
  for (const line of addressLines) {
    doc.text(line, startX);
  }
  doc.text(`Phone: ${data.store.phone}`, startX);
  doc.text(`Email: ${data.store.email}`, startX);

  let fromBottomY = doc.y;
  
  const orderColumnX = startX + 200;
  
  doc.fontSize(12)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('ORDER RECEIPT', orderColumnX, startY);
  
  let orderY = doc.y + 10;
  doc.fontSize(9)
    .font('Helvetica')
    .fillColor('#333')
    .text(`Order #: ${data.orderNumber}`, orderColumnX, orderY);
  
  orderY += 15;
  doc.text(`Date: ${new Date(data.date).toLocaleDateString()}`, orderColumnX, orderY);
  orderY += 15;
  doc.text(`Payment: ${data.payment.method}`, orderColumnX, orderY);
  orderY += 15;
  doc.text(`Status: ${data.payment.status}`, orderColumnX, orderY);
  
  const toColumnX = startX + 390;
  
  doc.fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('TO:', toColumnX, startY);
  
  doc.font('Helvetica').fontSize(9);
  let toY = doc.y + 10;
  doc.text(data.customer.name || 'Customer Name', toColumnX, toY, { width: 150 });
  toY += 15;
  
  if (data.shippingAddress) {
    if (data.shippingAddress.street) {
      doc.text(data.shippingAddress.street, toColumnX, toY, { width: 150 });
      toY += 15;
    }
    const cityStateZip = [
      data.shippingAddress.city,
      data.shippingAddress.state,
      data.shippingAddress.postalCode
    ].filter(Boolean).join(', ');
    if (cityStateZip) {
      doc.text(cityStateZip, toColumnX, toY, { width: 150 });
      toY += 15;
    }
    if (data.shippingAddress.country) {
      doc.text(data.shippingAddress.country, toColumnX, toY, { width: 150 });
      toY += 15;
    }
    if (data.shippingAddress.phone) {
      doc.text(`Phone: ${data.shippingAddress.phone}`, toColumnX, toY, { width: 150 });
      toY += 15;
    }
    if (data.shippingAddress.email) {
      doc.text(`Email: ${data.shippingAddress.email}`, toColumnX, toY, { width: 150 });
      toY += 15;
    }
  }
  
  const maxHeight = Math.max(fromBottomY - startY, orderY - startY, toY - startY);
  doc.y = startY + maxHeight + 20;
};

// ✅ UPDATED PDF items table with WEIGHT column
const addPDFItemsTable = (doc, data) => {
  const tableTop = doc.y + 10;
  
  // Table header - ADDED WEIGHT column
  doc.font('Helvetica-Bold')
     .fontSize(9)
     .text('PRODUCT', 50, tableTop)
     .text('QTY', 200, tableTop)
     .text('WEIGHT', 260, tableTop)
     .text('PRICE', 350, tableTop)
     .text('TOTAL', 450, tableTop);
  
  // Line under header
  doc.moveTo(50, tableTop + 15)
     .lineTo(550, tableTop + 15)
     .stroke();
  
  let yPosition = tableTop + 25;
  
  // Table rows with weight
  data.items.forEach((item) => {
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 50;
    }
    
    const weightDisplay = item.weight && item.weight > 0 ? `${item.weight}${item.weightUnit === 'gram' ? 'g' : item.weightUnit === 'kg' ? 'kg' : item.weightUnit}` : '-';
    
    doc.font('Helvetica')
       .fontSize(8)
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
  const totalsTop = doc.y;
  
  doc.font('Helvetica')
     .fontSize(9)
     .text(`Subtotal: ${data.pricing.subtotal.toFixed(2)}`, 400, totalsTop)
     .text(`Tax: ${data.pricing.tax.toFixed(2)}`, 400, totalsTop + 15)
     .text(`Shipping: ${data.pricing.shipping.toFixed(2)}`, 400, totalsTop + 30);
  
  doc.moveTo(400, totalsTop + 45)
     .lineTo(520, totalsTop + 45)
     .stroke();
  
  doc.font('Helvetica-Bold')
     .fontSize(10)
     .text(`TOTAL: ${data.pricing.total.toFixed(2)}`, 400, totalsTop + 55);
};

const addPDFFooter = (doc) => {
  doc.y = 750;
  doc.fontSize(8)
     .fillColor('#666666')
     .text('Thank you for your business!', { align: 'center' });
};

// Update order status by orderId
export const updateOrderStatusByOrderId = async (request, reply) => {
  try {
    const { orderStatus } = request.body;
    const { orderId } = request.params;

    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    const oldStatus = order.orderStatus;
    order.orderStatus = orderStatus;

    if (orderStatus === 'delivered') {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cod') {
        order.paymentStatus = 'completed';
      }
    }

    if (orderStatus === 'cancelled' && oldStatus !== 'cancelled') {
      order.cancelledAt = new Date();
      await restoreProductStock(order.products);
      
      // ✅ FIX: Remove delivery boy assignment when cancelled
      order.deliveryStatus = 'unassigned';
      order.deliveryAssignedAt = null;
      order.deliveryPickedUpAt = null;
      order.deliveryDeliveredAt = null;
    }

    await order.save();

    const customerEmail = order.shippingAddress?.email;
    const customerName = order.shippingAddress?.name || 'Customer';
    const customerPhone = order.shippingAddress?.phone;
    
    try {
      await sendOrderStatusUpdateEmail(order, { email: customerEmail, name: customerName }, oldStatus, orderStatus);
    } catch (emailError) {
      console.error('Failed to send status update email:', emailError);
    }
    
    try {
      if (customerPhone) {
        await sendOrderStatusSMS(customerPhone, order, orderStatus);
      }
    } catch (smsError) {
      console.error('Failed to send status update SMS:', smsError);
    }

    return reply.status(200).send({
      success: true,
      message: `Order status updated from ${oldStatus} to ${orderStatus}`,
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt
      }
    });

  } catch (error) {
    console.error('Update order status by orderId error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Cancel order
export const cancelOrder = async (request, reply) => {
  try {
    const { id } = request.params;
    const { cancellationReason } = request.body;
    const userId = request.user.userId || request.user.id;
    const isAdmin = request.user.role === 'admin';

    const order = await Order.findById(id);

    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    const isOrderOwner = order.user && order.user.toString() === userId;
    if (!isOrderOwner && !isAdmin) {
      return reply.status(403).send({
        success: false,
        message: 'Not authorized to cancel this order'
      });
    }

    if (order.orderStatus === 'cancelled') {
      return reply.status(400).send({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    const cancellableStatuses = ['pending', 'confirmed', 'processing'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return reply.status(400).send({
        success: false,
        message: `Cannot cancel order that is already ${order.orderStatus}`
      });
    }

    // Update order status
    order.orderStatus = 'cancelled';
    order.cancelledAt = new Date();
    
    // ✅ FIX: Update delivery status but KEEP delivery boy reference
    order.deliveryStatus = 'unassigned';
    // order.deliveryBoy = null;  // ✅ REMOVED - keep for history
    order.deliveryAssignedAt = null;
    
    if (cancellationReason) {
      order.cancellationReason = cancellationReason;
    }

    // Restore product stock
    await restoreProductStock(order.products);
    await order.save();

    console.log(`✅ Order ${order.orderId} cancelled by ${isAdmin ? 'admin' : 'user'}`);

    // Send cancellation email
    const customerEmail = order.shippingAddress?.email;
    const customerName = order.shippingAddress?.name || 'Customer';
    const customerPhone = order.shippingAddress?.phone;
    
    try {
      await sendOrderCancellationEmail(order, { email: customerEmail, name: customerName }, cancellationReason, isAdmin ? 'admin' : 'user');
      console.log(`📧 Cancellation email sent to ${customerEmail}`);
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
    }
    
    // Send cancellation SMS
    try {
      if (customerPhone) {
        await sendOrderCancellationSMS(customerPhone, order, cancellationReason);
        console.log(`📱 Cancellation SMS sent to ${customerPhone}`);
      }
    } catch (smsError) {
      console.error('Failed to send cancellation SMS:', smsError);
    }

    return reply.status(200).send({
      success: true,
      message: 'Order cancelled successfully. Refund can be processed by admin.',
      order: {
        _id: order._id,
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus,
        deliveryBoy: order.deliveryBoy,  // ✅ Will show delivery boy ID
        cancelledAt: order.cancelledAt,
        cancellationReason: order.cancellationReason
      }
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Server error while cancelling order',
      error: error.message
    });
  }
};

// Delete order (Admin only) - Delete ANY order regardless of status
export const deleteOrder = async (request, reply) => {
  try {
    const { id } = request.params;

    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    // ✅ NO CHECKS - Delete any order (Pending, Confirmed, Delivered, Cancelled, etc.)
    await order.deleteOne();
    console.log(`✅ Admin deleted order ${order.orderId} (Status: ${order.orderStatus})`);

    return reply.status(200).send({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('Delete order error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};
// Update order payment failed
export const updateOrderPaymentFailed = async (request, reply) => {
  try {
    const { orderId } = request.body;

    if (!orderId) {
      return reply.status(400).send({
        success: false,
        message: 'Order ID is required'
      });
    }

    const order = await Order.findOne({ orderId });

    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
    await order.save();

    return reply.status(200).send({
      success: true,
      message: 'Order payment status updated to failed',
      order
    });

  } catch (error) {
    console.error('Update order payment failed error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Process refund (Admin only)
export const processRefund = async (request, reply) => {
  try {
    const { id } = request.params;
    const { amount, reason } = request.body;
    
    if (request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const order = await Order.findById(id);
    
    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }
    
    if (order.refundStatus === 'completed') {
      return reply.status(400).send({
        success: false,
        message: 'This order has already been refunded'
      });
    }
    
    if (order.paymentMethod !== 'razorpay') {
      return reply.status(400).send({
        success: false,
        message: 'Only Razorpay orders can be refunded'
      });
    }
    
    if (order.paymentStatus !== 'completed') {
      return reply.status(400).send({
        success: false,
        message: 'Only completed payments can be refunded'
      });
    }
    
    if (!order.paymentId) {
      return reply.status(400).send({
        success: false,
        message: 'No payment ID found for this order'
      });
    }
    
    const refundAmount = amount || order.finalAmount;
    const refundAmountInPaise = Math.round(refundAmount * 100);
    
    console.log(`💰 Processing refund for order ${order.orderId}`);
    console.log(`   Amount: ${refundAmount}`);
    console.log(`   Payment ID: ${order.paymentId}`);
    
    try {
      const settings = await getStoreSettings();
      
      if (!settings.razorpayKeyId || !settings.razorpayKeySecret) {
        throw new Error('Razorpay keys not configured in settings');
      }
      
      const Razorpay = await import('razorpay');
      const razorpay = new Razorpay.default({
        key_id: settings.razorpayKeyId,
        key_secret: settings.razorpayKeySecret
      });
      
      const refund = await razorpay.payments.refund(order.paymentId, {
        amount: refundAmountInPaise,
        speed: 'normal',
        notes: {
          orderId: order.orderId,
          reason: reason || 'Refund processed by admin'
        }
      });
      
      order.refundStatus = 'completed';
      order.refundMessage = `Refund processed. Refund ID: ${refund.id}. Reason: ${reason || 'Admin initiated refund'}`;
      order.refundedAt = new Date();
      order.paymentStatus = 'refunded';
      await order.save();
      
      console.log(`✅ Refund processed successfully. Refund ID: ${refund.id}`);
      
      // ========== SEND REFUND EMAIL & SMS ==========
      const customerEmail = order.shippingAddress?.email;
      const customerName = order.shippingAddress?.name || 'Customer';
      const customerPhone = order.shippingAddress?.phone;
      
      // Send Refund Email
      if (customerEmail) {
        try {
          await sendOrderRefundEmail(order, { email: customerEmail, name: customerName }, refundAmount, reason);
          console.log(`📧 Refund email sent to ${customerEmail}`);
        } catch (emailError) {
          console.error('Failed to send refund email:', emailError);
        }
      }
      
      // Send Refund SMS
      if (customerPhone) {
        try {
          await sendOrderRefundSMS(customerPhone, order, refundAmount, reason);
          console.log(`📱 Refund SMS sent to ${customerPhone}`);
        } catch (smsError) {
          console.error('Failed to send refund SMS:', smsError);
        }
      }
      
      return reply.status(200).send({
        success: true,
        message: 'Refund processed successfully',
        refund: {
          id: refund.id,
          amount: refundAmount,
          status: refund.status,
          createdAt: refund.created_at
        }
      });
      
    } catch (refundError) {
      console.error('❌ Refund failed:', refundError);
      
      if (refundError.error && refundError.error.description === 'The payment has been fully refunded already') {
        order.refundStatus = 'completed';
        order.refundMessage = `Payment already refunded on Razorpay`;
        order.refundedAt = new Date();
        order.paymentStatus = 'refunded';
        await order.save();
        
        // Still send notification even if already refunded
        const customerEmail = order.shippingAddress?.email;
        const customerPhone = order.shippingAddress?.phone;
        
        if (customerEmail) {
          try {
            await sendOrderRefundEmail(order, { email: customerEmail, name: 'Customer' }, refundAmount, reason);
          } catch (e) { console.error(e); }
        }
        if (customerPhone) {
          try {
            await sendOrderRefundSMS(customerPhone, order, refundAmount, reason);
          } catch (e) { console.error(e); }
        }
        
        return reply.status(200).send({
          success: true,
          message: 'Payment was already refunded. Database updated.',
          alreadyRefunded: true
        });
      }
      
      order.refundStatus = 'failed';
      order.refundMessage = `Refund failed: ${refundError.message}`;
      await order.save();
      
      return reply.status(500).send({
        success: false,
        message: 'Refund failed',
        error: refundError.message
      });
    }
    
  } catch (error) {
    console.error('Process refund error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};