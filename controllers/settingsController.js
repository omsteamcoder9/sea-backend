import Setting from '../models/Setting.js';

// @desc    Get all settings
// @route   GET /api/admin/settings
// @access  Private/Admin
export const getSettings = async (request, reply) => {
  try {
    const settings = await Setting.getSettings();
    
    return reply.status(200).send({
      success: true,
      data: settings
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
export const updateSettings = async (request, reply) => {
  try {
    const {
      razorpayEnabled,
      razorpayKeyId,
      razorpayKeySecret,
      cashOnDeliveryEnabled,
      siteName,
      contactEmail,
      contactNumber
    } = request.body;

    let settings = await Setting.findOne();
    
    if (!settings) {
      settings = new Setting();
    }

    // Update payment settings
    if (typeof razorpayEnabled !== 'undefined') {
      settings.razorpayEnabled = razorpayEnabled;
    }
    if (razorpayKeyId !== undefined) {
      settings.razorpayKeyId = razorpayKeyId;
    }
    if (razorpayKeySecret !== undefined) {
      settings.razorpayKeySecret = razorpayKeySecret;
    }
    if (typeof cashOnDeliveryEnabled !== 'undefined') {
      settings.cashOnDeliveryEnabled = cashOnDeliveryEnabled;
    }
    
    // Update site settings
    if (siteName !== undefined) settings.siteName = siteName;
    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (contactNumber !== undefined) settings.contactNumber = contactNumber;
    
    settings.updatedAt = Date.now();

    await settings.save();

    return reply.status(200).send({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get public settings (for frontend)
// @route   GET /api/settings/public
// @access  Public
export const getPublicSettings = async (request, reply) => {
  try {
    const publicSettings = await Setting.getPublicSettings();
    
    return reply.status(200).send({
      success: true,
      data: publicSettings
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};