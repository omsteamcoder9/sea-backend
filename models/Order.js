import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  sNo: { type: Number, unique: true },

  // User
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ✅ Customer name (kept at top level for quick access)
  name: { type: String, default: '' },

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
    image: { type: String },
    weight: { type: Number, default: 0 },
    weightUnit: { type: String, default: 'gram' }
  }],

  // Shipping
  shippingAddress: {
    name:  { type: String, required: false, default: '' },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true },
    alternatePhone: { type: String, default: '' },   // ✅ NEW — optional
    email: { type: String, required: false, default: '' },

    // 🎯 Coordinates from Google Geocoding API or customer pin
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    // ✅ Where did these coords come from?
    // "customer_selected" → user dropped pin → TRUST 100%
    // "google_geocoded"   → backend guessed → DON'T TRUST
    // "none"              → no coords at all → fall back to text
    locationSource: {
      type: String,
      enum: ['customer_selected', 'google_geocoded', 'none'],
      default: 'none'
    },

    // ✅ Landmark hint for driver ("Near Anjaneyar Kovil")
    landmark: { type: String, default: '' }
  },

  // Ward Info
  wardId: { type: mongoose.Schema.Types.Mixed },
  wardName: { type: String },
  deliveryZone: { type: String },
  typedArea: { type: String, default: '' },

  // Payment
  paymentMethod: { type: String, enum: ['cod', 'razorpay', 'card'], required: true },
  paymentId: { type: String },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  paidAt: { type: Date },

  // Refund Info
  refundStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'not_applicable'],
    default: null
  },
  refundMessage: { type: String, default: '' },
  refundedAt: { type: Date, default: null },

  // Razorpay
  razorpayOrderId: { type: String, index: true },

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

  // Delivery Boy Fields
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', default: null },
  deliveryAssignedAt: { type: Date, default: null },
  deliveryPickedUpAt: { type: Date, default: null },
  deliveryDeliveredAt: { type: Date, default: null },
  deliveryStatus: {
    type: String,
    enum: ['unassigned', 'assigned', 'picked_up', 'delivered', 'waiting', 'returned'],
    default: 'unassigned'
  },

}, { timestamps: true });

// Pre-save middleware for orderId and sNo
orderSchema.pre('save', async function() {
  if (this.isNew) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderId = `ORD-${timestamp}-${random}`;

    const lastOrder = await this.constructor.findOne({}, {}, { sort: { sNo: -1 } });
    this.sNo = lastOrder ? lastOrder.sNo + 1 : 1;
  }
});

const Order = mongoose.model('Order', orderSchema);
export default Order;