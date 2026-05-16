import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  // Payment Settings
  razorpayEnabled: {
    type: Boolean,
    default: false
  },
  razorpayKeyId: {
    type: String,
    default: ''
  },
  razorpayKeySecret: {
    type: String,
    default: ''
  },
  cashOnDeliveryEnabled: {
    type: Boolean,
    default: true
  },
  
  // Site Settings
  siteName: {
    type: String,
    default: 'My Store'
  },
  contactEmail: {
    type: String,
    default: 'contact@example.com'
  },
  contactNumber: {
    type: String,
    default: '+91 1234567890'
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Get public settings (without sensitive data)
settingSchema.statics.getPublicSettings = async function() {
  const settings = await this.getSettings();
  
  return {
    razorpayEnabled: settings.razorpayEnabled,
    razorpayKeyId: settings.razorpayKeyId,
    cashOnDeliveryEnabled: settings.cashOnDeliveryEnabled,
    siteName: settings.siteName,
    contactEmail: settings.contactEmail,
    contactNumber: settings.contactNumber
  };
};

const Setting = mongoose.model('Setting', settingSchema);
export default Setting;