import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter function for Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.ADMIN_PASS,
    },
  });
};

// Send contact email to admin
export const sendContactEmail = async (contactData) => {
  const { name, email, phone, subject, message } = contactData;
  
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: `New Contact Form: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 5px;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone && phone !== 'No phone provided' ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <div style="background: white; padding: 15px; border-radius: 3px; margin-top: 10px;">
              ${message.replace(/\n/g, '<br>')}
            </div>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Contact email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending contact email:', error);
    throw error;
  }
};

// Send confirmation email to user
export const sendConfirmationEmail = async (contactData) => {
  const { name, email, subject } = contactData;
  
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: email,
      subject: `We've received your message: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Thank You for Contacting Us!</h2>
          <p>Dear <strong>${name}</strong>,</p>
          <p>We have received your message and will get back to you within 24-48 hours.</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p>Best regards,<br>Your Company Team</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
};

// ========== ORDER EMAIL FUNCTIONS ==========

// Send order confirmation email - WITH WEIGHT DISPLAY
export const sendOrderConfirmationEmail = async (order, customerInfo) => {
  try {
    const transporter = createTransporter();
    
    // Get email from customerInfo or from order.shippingAddress
    const customerEmail = customerInfo?.email || order.shippingAddress?.email;
    const customerName = customerInfo?.name || order.user?.name || 'Customer';
    
    if (!customerEmail) {
      console.log('❌ No customer email found, skipping order confirmation email');
      return { success: false, message: 'No email address found' };
    }
    
    // ✅ ADDED WEIGHT COLUMN IN TABLE
    const itemsHtml = order.products.map(item => {
      const weightDisplay = item.weight && item.weight > 0 ? `${item.weight}${item.weightUnit === 'gram' ? 'g' : item.weightUnit === 'kg' ? 'kg' : item.weightUnit}` : '-';
      
      return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name} ${item.variantName ? `(${item.variantName})` : ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${weightDisplay}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.quantity * item.price).toFixed(2)}</td>
      </tr>
    `}).join('');
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: customerEmail,
      subject: `Order Confirmation - ${order.orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #996600, #7a5200); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Order Confirmed!</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
            <p>Dear <strong>${customerName}</strong>,</p>
            <p>Thank you for your order! Your order has been confirmed and will be processed soon.</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #996600;">Order Details</h3>
              <p><strong>Order ID:</strong> ${order.orderId}</p>
              <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
              <p><strong>Payment Method:</strong> ${order.paymentMethod.toUpperCase()}</p>
              <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
              <p><strong>Order Status:</strong> ${order.orderStatus}</p>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #996600;">Items Ordered</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #f0f0f0;">
                    <th style="padding: 10px; text-align: left;">Product</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: center;">Weight</th>
                    <th style="padding: 10px; text-align: right;">Price</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="padding: 10px; text-align: right;"><strong>Subtotal:</strong></td>
                    <td style="padding: 10px; text-align: right;">₹${order.totalAmount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colspan="4" style="padding: 10px; text-align: right;"><strong>Shipping:</strong></td>
                    <td style="padding: 10px; text-align: right;">₹${order.shippingFee.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colspan="4" style="padding: 10px; text-align: right;"><strong>Tax:</strong></td>
                    <td style="padding: 10px; text-align: right;">₹${order.taxAmount.toFixed(2)}</td>
                  </tr>
                  <tr style="background: #f0f0f0;">
                    <td colspan="4" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                    <td style="padding: 10px; text-align: right;"><strong>₹${order.finalAmount.toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #996600;">Shipping Address</h3>
              <p>
                ${order.shippingAddress.street}<br>
                ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}<br>
                ${order.shippingAddress.country}<br>
                Phone: ${order.shippingAddress.phone}<br>
                Email: ${order.shippingAddress.email}
              </p>
            </div>
            
            <p>We'll notify you once your order is shipped.</p>
            
            <p>Best regards,<br><strong>SeaFood Team</strong></p>
          </div>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Order confirmation email sent to ${customerEmail}`, info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Error sending order confirmation email:', error);
    return { success: false, error: error.message };
  }
};

// Send order status update email - WITH WEIGHT DISPLAY
export const sendOrderStatusUpdateEmail = async (order, customerInfo, oldStatus, newStatus) => {
  try {
    const transporter = createTransporter();
    
    const customerEmail = customerInfo?.email || order.shippingAddress?.email;
    const customerName = customerInfo?.name || order.user?.name || 'Customer';
    
    if (!customerEmail) {
      console.log('❌ No customer email found, skipping status update email');
      return { success: false, message: 'No email address found' };
    }
    
    // ✅ ADDED WEIGHT COLUMN IN TABLE
    const itemsHtml = order.products.map(item => {
      const weightDisplay = item.weight && item.weight > 0 ? `${item.weight}${item.weightUnit === 'gram' ? 'g' : item.weightUnit === 'kg' ? 'kg' : item.weightUnit}` : '-';
      
      return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name} ${item.variantName ? `(${item.variantName})` : ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${weightDisplay}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.quantity * item.price).toFixed(2)}</td>
      </tr>
    `}).join('');
    
    const statusMessages = {
      confirmed: 'Your order has been confirmed and is being processed.',
      processing: 'Your order is now being processed.',
      shipped: 'Your order has been shipped and is on the way!',
      delivered: 'Your order has been delivered. Enjoy your purchase!',
      cancelled: 'Your order has been cancelled.'
    };
    
    const statusColors = {
      confirmed: '#2196F3',
      processing: '#FF9800',
      shipped: '#9C27B0',
      delivered: '#4CAF50',
      cancelled: '#F44336'
    };
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: customerEmail,
      subject: `Order Status Update - ${order.orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${statusColors[newStatus] || '#996600'}; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Order ${newStatus.toUpperCase()}</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
            <p>Dear <strong>${customerName}</strong>,</p>
            <p>Your order status has been updated.</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Order ID:</strong> ${order.orderId}</p>
              <p><strong>Previous Status:</strong> ${oldStatus}</p>
              <p><strong>New Status:</strong> <span style="color: ${statusColors[newStatus] || '#996600'}; font-weight: bold;">${newStatus}</span></p>
              <p><strong>Message:</strong> ${statusMessages[newStatus] || 'Your order status has been updated.'}</p>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #996600;">Items Ordered</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #f0f0f0;">
                    <th style="padding: 10px; text-align: left;">Product</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: center;">Weight</th>
                    <th style="padding: 10px; text-align: right;">Price</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                    <td style="padding: 10px; text-align: right;">₹${order.finalAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              
            </div>
            
            ${newStatus === 'shipped' ? `
              <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1976d2;">Track Your Order</h3>
                <p>You can track your order status in your account dashboard.</p>
              </div>
            ` : ''}
            
            ${newStatus === 'delivered' ? `
              <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #2e7d32;">Thank You!</h3>
                <p>We hope you enjoy your purchase. Please leave a review for the products you received.</p>
              </div>
            ` : ''}
            
            <p>Best regards,<br><strong>SeaFood Team</strong></p>
          </div>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Status update email sent to ${customerEmail}`);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Error sending status update email:', error);
    return { success: false, error: error.message };
  }
};

// Send order cancellation email - WITH WEIGHT DISPLAY
export const sendOrderCancellationEmail = async (order, customerInfo, cancellationReason, cancelledBy) => {
  try {
    const transporter = createTransporter();
    
    const customerEmail = customerInfo?.email || order.shippingAddress?.email;
    const customerName = customerInfo?.name || order.user?.name || 'Customer';
    
    if (!customerEmail) {
      console.log('❌ No customer email found, skipping cancellation email');
      return { success: false, message: 'No email address found' };
    }
    
    // ✅ ADDED WEIGHT COLUMN IN TABLE
    const itemsHtml = order.products.map(item => {
      const weightDisplay = item.weight && item.weight > 0 ? `${item.weight}${item.weightUnit === 'gram' ? 'g' : item.weightUnit === 'kg' ? 'kg' : item.weightUnit}` : '-';
      
      return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name} ${item.variantName ? `(${item.variantName})` : ''}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${weightDisplay}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.quantity * item.price).toFixed(2)}</td>
      </tr>
    `}).join('');
    
    const mailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: customerEmail,
      subject: `Order Cancelled - ${order.orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #F44336; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Order Cancelled</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
            <p>Dear <strong>${customerName}</strong>,</p>
            <p>We regret to inform you that your order has been cancelled.</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Order ID:</strong> ${order.orderId}</p>
              <p><strong>Cancelled By:</strong> ${cancelledBy === 'admin' ? 'Admin' : 'You'}</p>
              ${cancellationReason ? `<p><strong>Reason:</strong> ${cancellationReason}</p>` : ''}
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #996600;">Items Ordered</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: #f0f0f0;">
                    <th style="padding: 10px; text-align: left;">Product</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: center;">Weight</th>
                    <th style="padding: 10px; text-align: right;">Price</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="padding: 10px; text-align: right;"><strong>Total:</strong></td>
                    <td style="padding: 10px; text-align: right;">₹${order.finalAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              
            </div>
            
            ${order.paymentMethod === 'razorpay' && order.paymentStatus === 'completed' ? `
              <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #e65100;">Refund Information</h3>
                <p>Your payment will be refunded within 5-7 business days.</p>
              </div>
            ` : ''}
            
            <p>If you have any questions, please contact our support team.</p>
            
            <p>Best regards,<br><strong>SeaFood Team</strong></p>
          </div>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Cancellation email sent to ${customerEmail}`);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Error sending cancellation email:', error);
    return { success: false, error: error.message };
  }
};