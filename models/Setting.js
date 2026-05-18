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
  siteTitle: {
    type: String,
    default: ''
  },
  siteDescription: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    default: 'contact@example.com'
  },
  contactNumber: {
    type: String,
    default: '+91 1234567890'
  },
  companyAddress: {
    type: String,
    default: ''
  },
  
  // Social Media Settings
  socialMedia: {
    facebook: {
      type: String,
      default: ''
    },
    instagram: {
      type: String,
      default: ''
    },
    twitter: {
      type: String,
      default: ''
    },
    youtube: {
      type: String,
      default: ''
    },
    linkedin: {
      type: String,
      default: ''
    }
  },
  
  // Footer Settings
  footerText: {
    type: String,
    default: ''
  },
  footerLinks: {
    type: Array,
    default: []
  },
  
  // SEO Settings
  metaKeywords: {
    type: Array,
    default: []
  },
  googleAnalyticsId: {
    type: String,
    default: ''
  },
  
  // Script Tags
  headerScripts: {
    type: String,
    default: ''
  },
  bodyScripts: {
    type: String,
    default: ''
  },
  footerScripts: {
    type: String,
    default: ''
  },
  
  // Maintenance Mode
  maintenanceMode: {
    type: Boolean,
    default: false
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
    siteTitle: settings.siteTitle,
    siteDescription: settings.siteDescription,
    contactEmail: settings.contactEmail,
    contactNumber: settings.contactNumber,
    companyAddress: settings.companyAddress,
    socialMedia: settings.socialMedia,
    footerText: settings.footerText,
    footerLinks: settings.footerLinks,
    metaKeywords: settings.metaKeywords,
    googleAnalyticsId: settings.googleAnalyticsId,
    maintenanceMode: settings.maintenanceMode
  };
};

const Setting = mongoose.model('Setting', settingSchema);
export default Setting;