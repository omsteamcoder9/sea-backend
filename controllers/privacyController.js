import Privacy from '../models/Privacy.js';

// @desc    Get privacy policy
// @route   GET /api/privacy
// @access  Public
export const getPrivacy = async (request, reply) => {
  try {
    // Get latest version
    let privacy = await Privacy.findOne().sort({ version: -1 });
    
    // If no privacy policy exists, create default ones
    if (!privacy) {
      privacy = await Privacy.create({});
    }

    return reply.status(200).send({
      success: true,
      data: privacy
    });
  } catch (error) {
    console.error('Get privacy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching privacy policy',
      error: error.message
    });
  }
};

// @desc    Get specific version of privacy policy
// @route   GET /api/privacy/version/:version
// @access  Public
export const getPrivacyByVersion = async (request, reply) => {
  try {
    const { version } = request.params;
    const privacy = await Privacy.findOne({ version: parseInt(version) });

    if (!privacy) {
      return reply.status(404).send({
        success: false,
        message: `Privacy policy version ${version} not found`
      });
    }

    return reply.status(200).send({
      success: true,
      data: privacy
    });
  } catch (error) {
    console.error('Get privacy by version error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching privacy policy',
      error: error.message
    });
  }
};

// @desc    Get all versions of privacy policy
// @route   GET /api/privacy/versions
// @access  Private/Admin
export const getAllVersions = async (request, reply) => {
  try {
    const privacy = await Privacy.find().sort({ version: -1 });

    return reply.status(200).send({
      success: true,
      count: privacy.length,
      data: privacy
    });
  } catch (error) {
    console.error('Get all versions error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching privacy policy versions',
      error: error.message
    });
  }
};

// @desc    Create/Update privacy policy
// @route   POST /api/privacy
// @access  Private/Admin
export const createOrUpdatePrivacy = async (request, reply) => {
  try {
    const {
      privacyPolicyTitle,
      privacyPolicyLastUpdated,
      privacyIntroduction,
      privacyDataCollection,
      privacyDataUsage,
      privacyDataSharing,
      privacyDataSecurity,
      privacyUserRights,
      privacyCookies,
      privacyThirdPartyLinks,
      privacyPolicyChanges,
      privacyContactInfo,
      privacySections
    } = request.body;

    // Get latest version number
    const latestPrivacy = await Privacy.findOne().sort({ version: -1 });
    const newVersion = latestPrivacy ? latestPrivacy.version + 1 : 1;

    // Create new privacy policy with updated version
    const privacy = await Privacy.create({
      privacyPolicyTitle: privacyPolicyTitle || 'Privacy Policy',
      privacyPolicyLastUpdated: privacyPolicyLastUpdated || new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      privacyIntroduction: privacyIntroduction || 'This Privacy Policy describes how we collect, use, and handle your personal information when you use our website and services.',
      privacyDataCollection: privacyDataCollection || [
        'Name and contact information (email, phone number, address)',
        'Account credentials (username, password)',
        'Payment information (processed securely by third-party providers)',
        'Order history and preferences',
        'Device information (IP address, browser type, operating system)',
        'Usage data (pages visited, time spent, interactions)'
      ],
      privacyDataUsage: privacyDataUsage || [
        'Process and fulfill your orders',
        'Communicate with you about your account or orders',
        'Send you marketing communications (with your consent)',
        'Improve and optimize our website and services',
        'Detect and prevent fraud or security issues',
        'Comply with legal obligations'
      ],
      privacyDataSharing: privacyDataSharing || [
        'Service providers (payment processors, shipping carriers, email services)',
        'Legal authorities (when required by law or to protect our rights)',
        'Business transfers (in case of merger, acquisition, or sale)',
        'Third-party analytics providers (Google Analytics, etc.)'
      ],
      privacyDataSecurity: privacyDataSecurity || 'We implement appropriate technical and organizational measures to protect your personal information, including encryption, secure servers, access controls, and regular security assessments. However, no method of transmission over the Internet is 100% secure.',
      privacyUserRights: privacyUserRights || [
        'Access your personal data',
        'Correct inaccurate or incomplete data',
        'Request deletion of your data',
        'Object to or restrict data processing',
        'Data portability',
        'Withdraw consent at any time'
      ],
      privacyCookies: privacyCookies || 'We use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and personalize content. You can control cookie settings through your browser preferences.',
      privacyThirdPartyLinks: privacyThirdPartyLinks || 'Our website may contain links to third-party websites. We are not responsible for the privacy practices or content of these external sites. We encourage you to read their privacy policies.',
      privacyPolicyChanges: privacyPolicyChanges || 'We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last updated" date.',
      privacyContactInfo: privacyContactInfo || 'If you have any questions about this Privacy Policy or our data practices, please contact us through the information provided in our website footer.',
      privacySections: privacySections || [],
      version: newVersion
    });

    return reply.status(201).send({
      success: true,
      message: 'Privacy policy created successfully',
      data: privacy
    });
  } catch (error) {
    console.error('Create/Update privacy error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return reply.status(400).send({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    return reply.status(500).send({
      success: false,
      message: 'Error creating/updating privacy policy',
      error: error.message
    });
  }
};

// @desc    Update specific section
// @route   PUT /api/privacy/section/:sectionNumber
// @access  Private/Admin
export const updateSection = async (request, reply) => {
  try {
    const { sectionNumber } = request.params;
    const { title, content } = request.body;

    const privacy = await Privacy.findOne().sort({ version: -1 });

    if (!privacy) {
      return reply.status(404).send({
        success: false,
        message: 'Privacy policy not found'
      });
    }

    const sectionIndex = privacy.privacySections.findIndex(
      section => section.number === parseInt(sectionNumber)
    );

    if (sectionIndex === -1) {
      return reply.status(404).send({
        success: false,
        message: `Section ${sectionNumber} not found`
      });
    }

    if (title) privacy.privacySections[sectionIndex].title = title;
    if (content) privacy.privacySections[sectionIndex].content = content;

    await privacy.save();

    return reply.status(200).send({
      success: true,
      message: 'Section updated successfully',
      data: privacy.privacySections[sectionIndex]
    });
  } catch (error) {
    console.error('Update section error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error updating section',
      error: error.message
    });
  }
};

// @desc    Update data collection practices
// @route   PUT /api/privacy/data-collection
// @access  Private/Admin
export const updateDataCollection = async (request, reply) => {
  try {
    const { privacyDataCollection } = request.body;

    if (!Array.isArray(privacyDataCollection)) {
      return reply.status(400).send({
        success: false,
        message: 'Data collection must be an array'
      });
    }

    const privacy = await Privacy.findOne().sort({ version: -1 });

    if (!privacy) {
      return reply.status(404).send({
        success: false,
        message: 'Privacy policy not found'
      });
    }

    privacy.privacyDataCollection = privacyDataCollection;
    await privacy.save();

    return reply.status(200).send({
      success: true,
      message: 'Data collection updated successfully',
      data: privacy.privacyDataCollection
    });
  } catch (error) {
    console.error('Update data collection error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error updating data collection',
      error: error.message
    });
  }
};

// @desc    Delete privacy policy
// @route   DELETE /api/privacy/:id
// @access  Private/Admin
export const deletePrivacy = async (request, reply) => {
  try {
    const { id } = request.params;
    const privacy = await Privacy.findByIdAndDelete(id);

    if (!privacy) {
      return reply.status(404).send({
        success: false,
        message: 'Privacy policy not found'
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Privacy policy deleted successfully'
    });
  } catch (error) {
    console.error('Delete privacy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error deleting privacy policy',
      error: error.message
    });
  }
};

// @desc    Hard delete privacy policy (permanent)
// @route   DELETE /api/privacy/hard/:id
// @access  Private/Admin
export const hardDeletePrivacy = async (request, reply) => {
  try {
    const { id } = request.params;
    const privacy = await Privacy.findByIdAndDelete(id);

    if (!privacy) {
      return reply.status(404).send({
        success: false,
        message: 'Privacy policy not found'
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Privacy policy permanently deleted'
    });
  } catch (error) {
    console.error('Hard delete privacy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error permanently deleting privacy policy',
      error: error.message
    });
  }
};