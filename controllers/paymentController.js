// controllers/paymentController.js
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Setting from '../models/Setting.js';
// CORRECT
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import { sendOrderConfirmationSMS } from '../services/smsService.js';
import Product from '../models/productModel.js';

// Get Razorpay instance from settings
const getRazorpayInstance = async () => {
  const settings = await Setting.findOne().lean();
  
  if (!settings?.razorpayKeyId || !settings?.razorpayKeySecret) {
    throw new Error('Razorpay keys not configured in settings');
  }
  
  return new Razorpay({
    key_id: settings.razorpayKeyId,
    key_secret: settings.razorpayKeySecret,
  });
};

// Create Razorpay Order
export const createRazorpayOrder = async (request, reply) => {
  try {
    const { orderId } = request.body;

    if (!orderId) {
      return reply.status(400).send({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.paymentStatus === 'completed') {
      return reply.status(400).send({
        success: false,
        message: 'Order already paid'
      });
    }

    // Get settings
    const settings = await Setting.findOne().lean();
    
    if (!settings?.razorpayEnabled) {
      return reply.status(400).send({
        success: false,
        message: 'Razorpay payments are currently disabled'
      });
    }

    // Get Razorpay instance
    const razorpay = await getRazorpayInstance();

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100),
      currency: 'INR',
      receipt: order.orderId,
      notes: {
        orderId: order.orderId,
        userId: order.user?.toString() || 'guest'
      }
    });

    console.log('✅ Razorpay order created:', razorpayOrder.id);

    // Save payment record
    await Payment.create({
      orderId: order.orderId,
      razorpayOrderId: razorpayOrder.id,
      amount: order.finalAmount,
      status: 'created',
      method: 'razorpay',
      user: order.user || null,
      isGuest: !order.user,
      guestEmail: order.shippingAddress?.email
    });

    // Update order with razorpay order ID
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();
    
    console.log('✅ Saved razorpayOrderId to order:', order.razorpayOrderId);

    return reply.status(200).send({
      success: true,
      order: razorpayOrder,
      key: settings.razorpayKeyId
    });

  } catch (error) {
    console.error('Create Razorpay order error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Helper: Update product stock
const updateProductStock = async (products) => {
  console.log(`\n📦 Updating stock for ${products.length} items...`);
  
  for (const item of products) {
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
};

// Verify Razorpay Payment
export const verifyPayment = async (request, reply) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

    console.log('🔍 Verifying payment:', { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return reply.status(400).send({
        success: false,
        message: 'Missing payment verification data'
      });
    }

    // Get settings for secret key
    const settings = await Setting.findOne().lean();
    
    if (!settings?.razorpayKeySecret) {
      return reply.status(500).send({
        success: false,
        message: 'Razorpay secret key not configured'
      });
    }
    
    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', settings.razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    console.log('Generated signature:', generatedSignature);
    console.log('Received signature:', razorpay_signature);

    if (generatedSignature !== razorpay_signature) {
      return reply.status(400).send({
        success: false,
        message: 'Payment verification failed - invalid signature'
      });
    }

    // Find order by razorpayOrderId
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    
    if (!order) {
      console.log('❌ Order not found for razorpay_order_id:', razorpay_order_id);
      return reply.status(404).send({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('✅ Order found:', order.orderId);

    // Check if already paid
    if (order.paymentStatus === 'completed') {
      return reply.status(200).send({
        success: true,
        message: 'Payment already verified',
        order: {
          _id: order._id,
          orderId: order.orderId,
          finalAmount: order.finalAmount,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus
        }
      });
    }

    // Update payment record
    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'paid',
        paymentDetails: { razorpay_payment_id, razorpay_signature }
      }
    );

    // Update order
    order.paymentId = razorpay_payment_id;
    order.paymentStatus = 'completed';
    order.orderStatus = 'confirmed';
    order.paidAt = new Date();
    await order.save();

    console.log('✅ Payment verified for order:', order.orderId);

    // ========== UPDATE PRODUCT STOCK AFTER PAYMENT ==========
    try {
      await updateProductStock(order.products);
      console.log(`📦 Stock updated for order ${order.orderId}`);
    } catch (stockError) {
      console.error('Failed to update stock:', stockError);
    }

    // ========== SEND ORDER CONFIRMATION EMAIL & SMS AFTER PAYMENT ==========
    const customerEmail = order.shippingAddress?.email;
    const customerPhone = order.shippingAddress?.phone;
    const customerName = order.shippingAddress?.name || 'Customer';

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
      message: 'Payment verified and order confirmed successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        finalAmount: order.finalAmount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus
      }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Payment Failed Handler
export const paymentFailed = async (request, reply) => {
  try {
    const { razorpay_order_id } = request.body;

    console.log('❌ Payment failed for order:', razorpay_order_id);

    // Update payment record
    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { status: 'failed' }
    );

    // Update order
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (order) {
      order.paymentStatus = 'failed';
      order.orderStatus = 'cancelled';
      await order.save();
      console.log('✅ Order cancelled due to payment failure:', order.orderId);
    }

    return reply.status(200).send({
      success: false,
      message: 'Payment failed. Please try again.'
    });

  } catch (error) {
    console.error('Payment failed error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Get Payment Status by Order ID
export const getPaymentStatus = async (request, reply) => {
  try {
    const { orderId } = request.params;

    const payment = await Payment.findOne({ orderId });
    
    if (!payment) {
      return reply.status(404).send({
        success: false,
        message: 'Payment not found'
      });
    }

    return reply.status(200).send({
      success: true,
      payment: {
        orderId: payment.orderId,
        status: payment.status,
        amount: payment.amount,
        method: payment.method,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        createdAt: payment.createdAt
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Refund Payment
export const refundPayment = async (request, reply) => {
  try {
    const { paymentId } = request.params;
    const { refund_amount } = request.body;

    if (!paymentId) {
      return reply.status(400).send({
        success: false,
        message: 'Payment ID is required'
      });
    }

    if (!refund_amount || refund_amount <= 0) {
      return reply.status(400).send({
        success: false,
        message: 'Valid refund amount is required'
      });
    }

    const razorpay = await getRazorpayInstance();
    
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(refund_amount * 100)
    });

    // Update payment record
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentId },
      {
        status: 'refunded',
        refundId: refund.id,
        refundAmount: refund_amount,
        refundStatus: 'processed'
      }
    );

    // Update order
    const order = await Order.findOne({ paymentId });
    if (order) {
      order.paymentStatus = 'refunded';
      order.orderStatus = 'cancelled';
      await order.save();
    }

    return reply.status(200).send({
      success: true,
      refund,
      message: 'Payment refunded successfully'
    });

  } catch (error) {
    console.error('Refund payment error:', error);
    return reply.status(500).send({
      success: false,
      message: error?.error?.description || error.message || 'Refund failed'
    });
  }
};


// Add this function to paymentController.js
export const getRazorpayCheckoutPage = async (request, reply) => {
  try {
    const { orderId } = request.params;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return reply.status(404).send('Order not found');
    }
    
    const settings = await Setting.findOne();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #f5f5f5;
          }
          .container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }
          .loader-card {
            background: white;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            max-width: 350px;
            width: 100%;
          }
          .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #D53E0F;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
          }
          .subtitle {
            font-size: 14px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="loader-card">
            <div class="spinner"></div>
            <div class="title">Loading Payment Gateway</div>
            <div class="subtitle">Please wait...</div>
          </div>
        </div>
        
        <script>
          async function initPayment() {
            try {
              console.log('1️⃣ Creating Razorpay order...');
              
              const response = await fetch('/api/payments/create-order', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  orderId: '${orderId}' 
                })
              });
              
              const data = await response.json();
              console.log('2️⃣ Order created:', data);
              
              if (data.success) {
                var options = {
                  key: data.key,
                  amount: ${order.finalAmount * 100},
                  currency: 'INR',
                  name: '${settings?.siteName || 'Sea Food'}',
                  description: 'Order ${orderId}',
                  order_id: data.order.id,
                  prefill: {
                    name: '${(order.shippingAddress?.name || '').replace(/'/g, "\\'")}',
                    email: '${order.shippingAddress?.email || ''}',
                    contact: '${order.shippingAddress?.phone || ''}'
                  },
                  theme: {
                    color: '#D53E0F'
                  },
                  handler: function(response) {
                    console.log('3️ Payment success:', response);
                    
                    fetch('/api/payments/verify-payment', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature
                      })
                    })
                    .then(res => res.json())
                    .then(result => {
                      console.log('4️⃣ Verification result:', result);
                      if (result.success) {
                        // ✅ FIXED: Redirect to HTML page instead of deep link
                        window.location.href = '/payment-success?orderId=' + result.order.orderId;
                      } else {
                        window.location.href = '/payment-failed?message=' + encodeURIComponent(result.message);
                      }
                    })
                    .catch(err => {
                      console.error('Verification error:', err);
                      window.location.href = '/payment-error?message=' + encodeURIComponent(err.message);
                    });
                  },
                  modal: {
                    ondismiss: function() {
                      console.log('Payment modal closed');
                      window.location.href = '/payment-cancelled';
                    }
                  }
                };
                
                var rzp = new Razorpay(options);
                rzp.open();
              } else {
                console.error('Create order failed:', data.message);
                window.location.href = '/payment-error?message=' + encodeURIComponent(data.message || 'Failed to create order');
              }
            } catch (error) {
              console.error('Init payment error:', error);
              window.location.href = '/payment-error?message=' + encodeURIComponent(error.message);
            }
          }
          
          // Start payment after short delay
          setTimeout(initPayment, 500);
        </script>
      </body>
      </html>
    `;
    
    reply.type('text/html').send(html);
    
  } catch (error) {
    console.error('Razorpay page error:', error);
    return reply.status(500).send('Internal server error');
  }
};