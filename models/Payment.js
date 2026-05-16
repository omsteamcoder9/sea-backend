import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true
  },
  razorpayOrderId: {
    type: String
    // ❌ Remove: unique: true, sparse: true
  },
  razorpayPaymentId: {
    type: String
    // ❌ Remove: unique: true, sparse: true
  },
  razorpaySignature: {
    type: String
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'attempted', 'paid', 'failed', 'refunded'],
    default: 'created'
  },
  method: {
    type: String,
    enum: ['razorpay', 'cod', 'card', 'upi'],
    default: 'razorpay'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  guestEmail: {
    type: String
  },
  refundId: {
    type: String
  },
  refundAmount: {
    type: Number
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processed', 'failed'],
    default: 'none'
  },
  notes: {
    type: mongoose.Schema.Types.Mixed
  },
  paymentDetails: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// ✅ Indexes - defined only here
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;