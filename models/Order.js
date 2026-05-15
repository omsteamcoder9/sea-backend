import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  sNo: { type: Number, unique: true },
  
  // User
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Products
  products: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String, default: null },
    variantName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    discountPercentage: { type: Number, default: 0 },
    name: { type: String, required: true },
    image: { type: String }
  }],
  
  // Shipping
  shippingAddress: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true }
  },
  
  // Ward Info
  wardId: { type: Number },
  wardName: { type: String },
  deliveryZone: { type: String },
  
  // Payment
  paymentMethod: { type: String, enum: ['cod', 'razorpay', 'card'], required: true },
  paymentId: { type: String },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  paidAt: { type: Date },
  
  // Amounts
  totalAmount: { type: Number, required: true },
  shippingFee: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  
  // Status
  orderStatus: { type: String, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  cancelledAt: { type: Date },
  cancellationReason: { type: String },
  deliveredAt: { type: Date },
  
}, { timestamps: true });

// Pre-save middleware for orderId and sNo
orderSchema.pre('save', async function() {
  if (this.isNew) {
    // Generate orderId
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderId = `ORD-${timestamp}-${random}`;
    
    // Auto increment sNo
    const lastOrder = await this.constructor.findOne({}, {}, { sort: { sNo: -1 } });
    this.sNo = lastOrder ? lastOrder.sNo + 1 : 1;
  }
});

const Order = mongoose.model('Order', orderSchema);
export default Order;