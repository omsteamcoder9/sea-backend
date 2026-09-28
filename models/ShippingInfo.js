// models/ShippingInfo.js
import mongoose from 'mongoose';

const shippingInfoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Shipping Information',
    },

    headerBadge: {
      type: String,
      default: 'Fresh Fish Delivered Next Day',
      trim: true,
    },

    headerSubtitle: {
      type: String,
      default:
        'We ensure your seafood arrives fresh, fast, and perfectly chilled. Order today and get your fish tomorrow — with free delivery!',
      trim: true,
    },

    // Delivery Promise Section
    deliveryPromise: {
      title: {
        type: String,
        default: 'Order by 2 PM, Get It Tomorrow',
      },
      description: {
        type: String,
        default:
          "Place your order before 2:00 PM local time and we'll deliver your fresh catch the very next day. All orders are packed in insulated, eco-friendly boxes with ice packs to maintain perfect temperature.",
      },
    },

    // Delivery Areas
    deliveryAreas: [
      {
        areaName: { type: String, required: true },
        timing: { type: String, required: true },
      },
    ],

    // Shipping Charges (free for all)
    shippingCharges: {
      isFree: { type: Boolean, default: true },
      freeShippingMessage: {
        type: String,
        default: 'FREE Shipping on All Orders',
      },
      freeShippingDescription: {
        type: String,
        default:
          'No minimum order value. No hidden charges. Every order — big or small — gets free delivery, because fresh fish should be affordable for everyone.',
      },
      // Optional: if admin wants to disable free shipping and show tiers
      chargeTiers: [
        {
          label: { type: String }, // e.g. "Orders above ₹999"
          amount: { type: String }, // e.g. "FREE Shipping" or "₹49"
        },
      ],
    },

    // Packaging
    packaging: {
      title: { type: String, default: 'How We Pack Your Fish' },
      items: [{ type: String }],
    },

    // Order Tracking
    orderTracking: {
      title: { type: String, default: 'Track Your Order' },
      description: {
        type: String,
        default:
          "Once your order is shipped, you'll receive an SMS and email with a tracking link. You can also track your order in real-time from your account dashboard.",
      },
      highlight: {
        type: String,
        default: 'Real-time tracking with delivery ETA updates',
      },
    },

    isActive: { type: Boolean, default: true },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

const ShippingInfo = mongoose.model('ShippingInfo', shippingInfoSchema);
export default ShippingInfo;