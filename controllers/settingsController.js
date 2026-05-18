import Setting from '../models/Setting.js';

// @desc    Get all settings
// @route   GET /api/admin/settings
// @access  Private/Admin
export const getSettings = async (request, reply) => {
  try {
    const settings = await Setting.getSettings();
    
    // Transform for frontend compatibility
    const responseData = settings.toObject();
    responseData.facebookUrl = responseData.socialMedia?.facebook || '';
    responseData.instagramUrl = responseData.socialMedia?.instagram || '';
    responseData.twitterUrl = responseData.socialMedia?.twitter || '';
    responseData.youtubeUrl = responseData.socialMedia?.youtube || '';
    responseData.linkedinUrl = responseData.socialMedia?.linkedin || '';
    
    return reply.status(200).send({
      success: true,
      data: responseData
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
      siteTitle,
      siteDescription,
      contactEmail,
      contactNumber,
      companyAddress,
      socialMedia,
      facebookUrl,
      twitterUrl,
      instagramUrl,
      youtubeUrl,
      linkedinUrl,
      footerText,
      footerLinks,
      metaKeywords,
      googleAnalyticsId,
      maintenanceMode,
      headerScripts,
      bodyScripts,
      footerScripts
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
    if (siteTitle !== undefined) settings.siteTitle = siteTitle;
    if (siteDescription !== undefined) settings.siteDescription = siteDescription;
    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (contactNumber !== undefined) settings.contactNumber = contactNumber;
    if (companyAddress !== undefined) settings.companyAddress = companyAddress;
    
    // Update footer settings
    if (footerText !== undefined) settings.footerText = footerText;
    if (footerLinks !== undefined) settings.footerLinks = footerLinks;
    
    // Update SEO settings
    if (metaKeywords !== undefined) settings.metaKeywords = metaKeywords;
    if (googleAnalyticsId !== undefined) settings.googleAnalyticsId = googleAnalyticsId;
    
    // Update script tags
    if (headerScripts !== undefined) settings.headerScripts = headerScripts;
    if (bodyScripts !== undefined) settings.bodyScripts = bodyScripts;
    if (footerScripts !== undefined) settings.footerScripts = footerScripts;
    
    // Update maintenance mode
    if (typeof maintenanceMode !== 'undefined') settings.maintenanceMode = maintenanceMode;
    
    // Initialize socialMedia if it doesn't exist
    if (!settings.socialMedia) {
      settings.socialMedia = {};
    }
    
    // Update social media from nested object
    if (socialMedia !== undefined) {
      settings.socialMedia = {
        ...settings.socialMedia,
        ...socialMedia
      };
    }
    
    // Update social media from individual fields (frontend format)
    if (facebookUrl !== undefined) settings.socialMedia.facebook = facebookUrl || '';
    if (instagramUrl !== undefined) settings.socialMedia.instagram = instagramUrl || '';
    if (twitterUrl !== undefined) settings.socialMedia.twitter = twitterUrl || '';
    if (youtubeUrl !== undefined) settings.socialMedia.youtube = youtubeUrl || '';
    if (linkedinUrl !== undefined) settings.socialMedia.linkedin = linkedinUrl || '';
    
    settings.updatedAt = Date.now();

    await settings.save();

    // Transform response for frontend compatibility
    const responseData = settings.toObject();
    responseData.facebookUrl = responseData.socialMedia?.facebook || '';
    responseData.instagramUrl = responseData.socialMedia?.instagram || '';
    responseData.twitterUrl = responseData.socialMedia?.twitter || '';
    responseData.youtubeUrl = responseData.socialMedia?.youtube || '';
    responseData.linkedinUrl = responseData.socialMedia?.linkedin || '';

    return reply.status(200).send({
      success: true,
      message: 'Settings updated successfully',
      data: responseData
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
    
    // Transform for frontend compatibility
    const responseData = {
      ...publicSettings,
      facebookUrl: publicSettings.socialMedia?.facebook || '',
      instagramUrl: publicSettings.socialMedia?.instagram || '',
      twitterUrl: publicSettings.socialMedia?.twitter || '',
      youtubeUrl: publicSettings.socialMedia?.youtube || '',
      linkedinUrl: publicSettings.socialMedia?.linkedin || ''
    };
    
    return reply.status(200).send({
      success: true,
      data: responseData
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};