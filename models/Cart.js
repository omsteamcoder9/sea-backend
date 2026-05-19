// models/Cart.js
import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  originalPrice: {
    type: Number,
    default: null
  },
  variantId: {
    type: String,
    default: null
  },
  variantName: {
    type: String,
    default: ''
  },
  productName: {
    type: String,
    default: ''
  },
  productImage: {
    type: String,
    default: ''
  },
  // ✅ ADD THESE WEIGHT FIELDS
  weight: {
    type: Number,
    default: 0
  },
  weightUnit: {
    type: String,
    default: 'gram'
  }
}, {
  timestamps: true
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  guestId: {
    type: String,
    required: false,
    default: null
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  },
  totalOriginalPrice: {
    type: Number,
    default: 0
  },
  totalSavings: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;