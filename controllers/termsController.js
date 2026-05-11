import Terms from '../models/Terms.js';

// @desc    Get terms of service
// @route   GET /api/terms
// @access  Public
export const getTerms = async (request, reply) => {
  try {
    // Get latest version
    let terms = await Terms.findOne().sort({ version: -1 });
    
    // If no terms exist, create default ones
    if (!terms) {
      terms = await Terms.create({});
    }

    return reply.status(200).send({
      success: true,
      data: terms
    });
  } catch (error) {
    console.error('Get terms error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching terms of service',
      error: error.message
    });
  }
};

// @desc    Get specific version of terms
// @route   GET /api/terms/version/:version
// @access  Public
export const getTermsByVersion = async (request, reply) => {
  try {
    const { version } = request.params;
    const terms = await Terms.findOne({ version: parseInt(version) });

    if (!terms) {
      return reply.status(404).send({
        success: false,
        message: `Terms version ${version} not found`
      });
    }

    return reply.status(200).send({
      success: true,
      data: terms
    });
  } catch (error) {
    console.error('Get terms by version error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching terms of service',
      error: error.message
    });
  }
};

// @desc    Get all versions of terms
// @route   GET /api/terms/versions
// @access  Private/Admin
export const getAllVersions = async (request, reply) => {
  try {
    const terms = await Terms.find().sort({ version: -1 });

    return reply.status(200).send({
      success: true,
      count: terms.length,
      data: terms
    });
  } catch (error) {
    console.error('Get all versions error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching terms versions',
      error: error.message
    });
  }
};

// @desc    Create/Update terms of service
// @route   POST /api/terms
// @access  Private/Admin
export const createOrUpdateTerms = async (request, reply) => {
  try {
    const {
      termsOfServiceTitle,
      termsOfServiceLastUpdated,
      termsImportantNotice,
      termsUserRequirements,
      termsSections,
      termsIntellectualProperty,
      termsLimitationLiability,
      termsChangesNotice,
      termsContactInfo
    } = request.body;

    // Get latest version number
    const latestTerms = await Terms.findOne().sort({ version: -1 });
    const newVersion = latestTerms ? latestTerms.version + 1 : 1;

    // Create new terms with updated version
    const terms = await Terms.create({
      termsOfServiceTitle: termsOfServiceTitle || 'Terms of Service',
      termsOfServiceLastUpdated: termsOfServiceLastUpdated || new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      termsImportantNotice,
      termsUserRequirements: termsUserRequirements || [
        'You must be at least 18 years old to place an order',
        'Payment processing is handled by secure third-party providers',
        'All product images are for illustrative purposes only',
        'Shipping times are estimates and not guarantees',
        'We reserve the right to refuse service to anyone'
      ],
      termsSections: termsSections || [],
      termsIntellectualProperty,
      termsLimitationLiability,
      termsChangesNotice,
      termsContactInfo,
      version: newVersion
    });

    return reply.status(201).send({
      success: true,
      message: 'Terms of service created successfully',
      data: terms
    });
  } catch (error) {
    console.error('Create/Update terms error:', error);
    
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
      message: 'Error creating/updating terms of service',
      error: error.message
    });
  }
};

// @desc    Update specific section
// @route   PUT /api/terms/section/:sectionNumber
// @access  Private/Admin
export const updateSection = async (request, reply) => {
  try {
    const { sectionNumber } = request.params;
    const { title, content } = request.body;

    const terms = await Terms.findOne().sort({ version: -1 });

    if (!terms) {
      return reply.status(404).send({
        success: false,
        message: 'Terms of service not found'
      });
    }

    const sectionIndex = terms.termsSections.findIndex(
      section => section.number === parseInt(sectionNumber)
    );

    if (sectionIndex === -1) {
      return reply.status(404).send({
        success: false,
        message: `Section ${sectionNumber} not found`
      });
    }

    if (title) terms.termsSections[sectionIndex].title = title;
    if (content) terms.termsSections[sectionIndex].content = content;

    await terms.save();

    return reply.status(200).send({
      success: true,
      message: 'Section updated successfully',
      data: terms.termsSections[sectionIndex]
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

// @desc    Update user requirements
// @route   PUT /api/terms/requirements
// @access  Private/Admin
export const updateRequirements = async (request, reply) => {
  try {
    const { termsUserRequirements } = request.body;

    if (!Array.isArray(termsUserRequirements)) {
      return reply.status(400).send({
        success: false,
        message: 'Requirements must be an array'
      });
    }

    const terms = await Terms.findOne().sort({ version: -1 });

    if (!terms) {
      return reply.status(404).send({
        success: false,
        message: 'Terms of service not found'
      });
    }

    terms.termsUserRequirements = termsUserRequirements;
    await terms.save();

    return reply.status(200).send({
      success: true,
      message: 'Requirements updated successfully',
      data: terms.termsUserRequirements
    });
  } catch (error) {
    console.error('Update requirements error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error updating requirements',
      error: error.message
    });
  }
};

// @desc    Delete terms
// @route   DELETE /api/terms/:id
// @access  Private/Admin
export const deleteTerms = async (request, reply) => {
  try {
    const { id } = request.params;
    const terms = await Terms.findByIdAndDelete(id);

    if (!terms) {
      return reply.status(404).send({
        success: false,
        message: 'Terms not found'
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Terms deleted successfully'
    });
  } catch (error) {
    console.error('Delete terms error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error deleting terms',
      error: error.message
    });
  }
};

// @desc    Hard delete terms (permanent)
// @route   DELETE /api/terms/hard/:id
// @access  Private/Admin
export const hardDeleteTerms = async (request, reply) => {
  try {
    const { id } = request.params;
    const terms = await Terms.findByIdAndDelete(id);

    if (!terms) {
      return reply.status(404).send({
        success: false,
        message: 'Terms not found'
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Terms permanently deleted'
    });
  } catch (error) {
    console.error('Hard delete terms error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error permanently deleting terms',
      error: error.message
    });
  }
};