// models/ReturnPolicy.js
import mongoose from 'mongoose';

const returnPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Returns & Refunds',
    },

    headerBadge: {
      type: String,
      default: 'Freshness Guaranteed',
      trim: true,
    },

    headerSubtitle: {
      type: String,
      default:
        "Not happy with your fish? We'll make it right. Our hassle-free returns ensure you get the quality you deserve.",
      trim: true,
    },

    // Our Returns Policy
    returnsPolicy: {
      title: { type: String, default: "Not Fresh? We'll Replace or Refund." },
      description: {
        type: String,
        default:
          "If your fish doesn't arrive fresh, or isn't what you ordered, contact us within 4 hours of delivery. We'll arrange a replacement or issue a full refund—no questions asked.",
      },
    },

    // How to Request a Return — steps
    returnSteps: [
      {
        stepNumber: { type: Number, required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],

    // Eligible for return
    eligibleItems: [{ type: String }],

    // Not eligible for return
    nonEligibleItems: [{ type: String }],

    // Refund Timeline
    refundTimeline: [
      {
        method: { type: String, required: true }, // e.g. "Credit/Debit Card"
        timeline: { type: String, required: true }, // e.g. "3-5 business days"
      },
    ],

    // Contact section
    contact: {
      title: { type: String, default: 'Need Help?' },
      description: {
        type: String,
        default:
          'Our support team is here to help with returns, refunds, or any questions.',
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

const ReturnPolicy = mongoose.model('ReturnPolicy', returnPolicySchema);
export default ReturnPolicy;