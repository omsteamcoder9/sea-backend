// controllers/returnController.js
import ReturnPolicy from '../models/ReturnPolicy.js';

// ✅ GET public return policy (for frontend page)
export const getReturnPolicy = async (request, reply) => {
  try {
    let policy = await ReturnPolicy.findOne({ isActive: true }).sort({
      createdAt: -1,
    });

    // Auto-create default if none exists
    if (!policy) {
      policy = await ReturnPolicy.create({
        returnSteps: [
          {
            stepNumber: 1,
            title: 'Contact Us Within 4 Hours',
            description:
              'Call or email our support team with your order number and photos of the issue.',
          },
          {
            stepNumber: 2,
            title: 'Quick Verification',
            description:
              'Our team will verify your claim within 30 minutes during business hours.',
          },
          {
            stepNumber: 3,
            title: 'Choose Your Resolution',
            description:
              'Pick a replacement (delivered next day) or a full refund to your original payment method.',
          },
          {
            stepNumber: 4,
            title: 'Fast Resolution',
            description:
              'Refunds are processed within 3-5 business days. Replacements ship immediately.',
          },
        ],
        eligibleItems: [
          'Fish not fresh or spoiled',
          'Wrong item delivered',
          'Incomplete order',
          'Damaged packaging affecting quality',
          'Temperature abuse during transit',
          'Item missing from order',
        ],
        nonEligibleItems: [
          'Change of mind after delivery',
          'Incorrect cooking or storage by customer',
          'Claims made after 4 hours of delivery',
          'Items without original packaging',
          'Custom-cut or special orders',
        ],
        refundTimeline: [
          { method: 'Credit/Debit Card', timeline: '3-5 business days' },
          { method: 'UPI / Net Banking', timeline: '1-3 business days' },
          { method: 'Wallet', timeline: 'Instant' },
          { method: 'Cash on Delivery', timeline: 'Bank transfer in 3-5 days' },
        ],
      });
    }

    return reply.status(200).send({
      success: true,
      data: policy,
      message: 'Return policy retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Get return policy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching return policy',
      error: error.message,
    });
  }
};

// ✅ GET return policy by ID (admin)
export const getReturnPolicyById = async (request, reply) => {
  try {
    const { id } = request.params;
    const policy = await ReturnPolicy.findById(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        message: 'Return policy not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: policy,
      message: 'Return policy retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Get return policy by ID error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching return policy',
      error: error.message,
    });
  }
};

// ✅ CREATE return policy (admin)
export const createReturnPolicy = async (request, reply) => {
  try {
    const userId = request.user?._id || request.user?.id;

    const policy = await ReturnPolicy.create({
      ...request.body,
      updatedBy: userId,
    });

    return reply.status(201).send({
      success: true,
      data: policy,
      message: 'Return policy created successfully',
    });
  } catch (error) {
    console.error('❌ Create return policy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error creating return policy',
      error: error.message,
    });
  }
};

// ✅ UPDATE return policy (admin)
export const updateReturnPolicy = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user?._id || request.user?.id;

    const policy = await ReturnPolicy.findByIdAndUpdate(
      id,
      { ...request.body, updatedBy: userId },
      { new: true, runValidators: true }
    );

    if (!policy) {
      return reply.status(404).send({
        success: false,
        message: 'Return policy not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: policy,
      message: 'Return policy updated successfully',
    });
  } catch (error) {
    console.error('❌ Update return policy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error updating return policy',
      error: error.message,
    });
  }
};

// ✅ DELETE return policy (admin)
export const deleteReturnPolicy = async (request, reply) => {
  try {
    const { id } = request.params;

    const policy = await ReturnPolicy.findByIdAndDelete(id);

    if (!policy) {
      return reply.status(404).send({
        success: false,
        message: 'Return policy not found',
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Return policy deleted successfully',
    });
  } catch (error) {
    console.error('❌ Delete return policy error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error deleting return policy',
      error: error.message,
    });
  }
};