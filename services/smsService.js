// services/smsService.js
import axios from 'axios';
import dotenv from 'dotenv';
import Setting from '../models/Setting.js';

dotenv.config();

const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY;
const TWO_FACTOR_BASE_URL = process.env.TWO_FACTOR_BASE_URL || 'https://2factor.in/API/V1';

// ============================================
// 🎯 SENDER NAME — Dynamic from Settings
// ============================================
let cachedSiteName = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getSenderName = async () => {
  const now = Date.now();
  if (cachedSiteName && now - cacheTime < CACHE_TTL) {
    return cachedSiteName;
  }
  try {
    const settings = await Setting.findOne().select('siteName');
    cachedSiteName = settings?.siteName?.trim() || 'MeenavanFresh';
    cacheTime = now;
    return cachedSiteName;
  } catch (error) {
    console.error('Error fetching site name:', error);
    return cachedSiteName || 'MeenavanFresh';
  }
};

// ============================================
// 📱 CORE SMS FUNCTION
// ============================================
export const sendSMS = async (phoneNumber, message) => {
  try {
    if (!TWO_FACTOR_API_KEY) {
      console.error('❌ TWO_FACTOR_API_KEY not found in environment variables');
      return { success: false, message: 'SMS API key missing' };
    }

    // Clean phone number (remove +91 if present, ensure 10 digits)
    let cleanedPhone = phoneNumber.toString().replace(/\D/g, '');
    if (cleanedPhone.startsWith('91') && cleanedPhone.length === 12) {
      cleanedPhone = cleanedPhone.substring(2);
    }
    if (cleanedPhone.length !== 10) {
      console.error(`❌ Invalid phone number format: ${phoneNumber}`);
      return { success: false, message: 'Invalid phone number format' };
    }

    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/ADDON_SERVICES/SEND/PSMS/${cleanedPhone}/Auto/${encodeURIComponent(message)}`;

    console.log(`📱 Sending SMS to ${cleanedPhone}...`);
    console.log(`📝 Message: ${message}`);
    console.log(`🔗 URL: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 Response:`, response.data);

    if (response.data.Status === 'Success') {
      console.log(`✅ SMS sent successfully to ${cleanedPhone}`);
      return { success: true, status: response.data.Status, details: response.data };
    } else {
      console.error(`❌ SMS failed: ${response.data.Status} - ${response.data.Details || 'Unknown error'}`);
      return { success: false, message: response.data.Status, details: response.data };
    }

  } catch (error) {
    console.error('❌ SMS sending error details:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    return { success: false, message: error.message };
  }
};

// Alternative: Send SMS using template (if you have DLT registered)
export const sendSMSTemplate = async (phoneNumber, templateId, templateData = {}) => {
  try {
    let cleanedPhone = phoneNumber.toString().replace(/\D/g, '');
    if (cleanedPhone.startsWith('91') && cleanedPhone.length === 12) {
      cleanedPhone = cleanedPhone.substring(2);
    }

    const url = `${TWO_FACTOR_BASE_URL}/${TWO_FACTOR_API_KEY}/ADDON_SERVICES/SEND/TSMS/${cleanedPhone}/Auto/${templateId}`;

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data.Status === 'Success') {
      console.log(`✅ Template SMS sent successfully`);
      return { success: true, details: response.data };
    } else {
      console.error(`❌ Template SMS failed: ${response.data.Details}`);
      return { success: false, message: response.data.Details };
    }
  } catch (error) {
    console.error('❌ Template SMS error:', error.message);
    return { success: false, message: error.message };
  }
};

// ============================================
// 📱 ORDER SMS — Dynamic Site Name
// ============================================

// Send order confirmation SMS
export const sendOrderConfirmationSMS = async (phoneNumber, order) => {
  const siteName = await getSenderName();
  const message = `${siteName}: Order ${order.orderId} confirmed! Amount: ₹${order.finalAmount}. We'll notify you once shipped. Thank you!`;
  return await sendSMS(phoneNumber, message);
};

// Send order status update SMS
export const sendOrderStatusSMS = async (phoneNumber, order, newStatus) => {
  const siteName = await getSenderName();

  const statusMessages = {
    confirmed: `Order ${order.orderId} confirmed!`,
    processing: `Order ${order.orderId} is being processed.`,
    shipped: `Order ${order.orderId} has been shipped!`,
    delivered: `Order ${order.orderId} delivered! Thank you for shopping with ${siteName}.`,
    cancelled: `Order ${order.orderId} has been cancelled.`,
  };

  const message = `${siteName}: ${statusMessages[newStatus] || `Order ${order.orderId} status updated to ${newStatus}`}`;
  return await sendSMS(phoneNumber, message);
};

// Send order cancellation SMS
export const sendOrderCancellationSMS = async (phoneNumber, order, reason) => {
  const siteName = await getSenderName();
  const message = `${siteName}: Order ${order.orderId} cancelled.${reason ? ` Reason: ${reason}` : ''} Contact support for queries.`;
  console.log(`📱 Sending cancellation SMS to ${phoneNumber} for order ${order.orderId}`);
  const result = await sendSMS(phoneNumber, message);
  if (result.success) {
    console.log(`✅ Cancellation SMS sent to ${phoneNumber}`);
  } else {
    console.log(`❌ Cancellation SMS failed to ${phoneNumber}`);
  }
  return result;
};

// Send order refund SMS
export const sendOrderRefundSMS = async (phoneNumber, order, refundAmount, reason) => {
  const siteName = await getSenderName();
  const message = `${siteName}: Refund of ₹${refundAmount} for order ${order.orderId} has been processed. Amount will reflect in 5-7 business days. Thank you!`;
  return await sendSMS(phoneNumber, message);
};

// ============================================
// 🧪 TEST
// ============================================
export const testSMS = async (phoneNumber) => {
  console.log('🧪 Testing SMS configuration...');
  const siteName = await getSenderName();
  const result = await sendSMS(phoneNumber, `Test message from ${siteName} API`);
  console.log('Test result:', result);
  return result;
};