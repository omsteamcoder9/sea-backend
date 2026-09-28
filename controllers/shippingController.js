// controllers/shippingController.js
import ShippingInfo from '../models/ShippingInfo.js';

// ✅ GET public shipping info (for frontend page)
export const getShippingInfo = async (request, reply) => {
  try {
    let shipping = await ShippingInfo.findOne({ isActive: true }).sort({
      createdAt: -1,
    });

    // Auto-create default if none exists
    if (!shipping) {
      shipping = await ShippingInfo.create({
        deliveryAreas: [
          { areaName: 'Metro Cities', timing: 'Next-day delivery before 12:00 PM' },
          { areaName: 'Tier 2 Cities', timing: 'Next-day delivery before 6:00 PM' },
          { areaName: 'Remote Areas', timing: '2-3 business days (extra care packaging)' },
          { areaName: 'Same-Day Delivery', timing: 'Available in select pin codes (order by 10 AM)' },
        ],
        packaging: {
          items: [
            'Food-grade insulated boxes',
            'Gel ice packs to maintain 0-4°C',
            'Vacuum-sealed for freshness',
            'Leak-proof and eco-friendly packaging',
            'Temperature monitoring during transit',
            'Contactless delivery available',
          ],
        },
      });
    }

    return reply.status(200).send({
      success: true,
      data: shipping,
      message: 'Shipping info retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Get shipping info error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching shipping info',
      error: error.message,
    });
  }
};

// ✅ GET shipping info by ID (admin)
export const getShippingById = async (request, reply) => {
  try {
    const { id } = request.params;
    const shipping = await ShippingInfo.findById(id);

    if (!shipping) {
      return reply.status(404).send({
        success: false,
        message: 'Shipping info not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: shipping,
      message: 'Shipping info retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Get shipping by ID error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching shipping info',
      error: error.message,
    });
  }
};

// ✅ CREATE shipping info (admin)
export const createShippingInfo = async (request, reply) => {
  try {
    const userId = request.user?._id || request.user?.id;

    const shipping = await ShippingInfo.create({
      ...request.body,
      updatedBy: userId,
    });

    return reply.status(201).send({
      success: true,
      data: shipping,
      message: 'Shipping info created successfully',
    });
  } catch (error) {
    console.error('❌ Create shipping error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error creating shipping info',
      error: error.message,
    });
  }
};

// ✅ UPDATE shipping info (admin)
export const updateShippingInfo = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user?._id || request.user?.id;

    const shipping = await ShippingInfo.findByIdAndUpdate(
      id,
      { ...request.body, updatedBy: userId },
      { new: true, runValidators: true }
    );

    if (!shipping) {
      return reply.status(404).send({
        success: false,
        message: 'Shipping info not found',
      });
    }

    return reply.status(200).send({
      success: true,
      data: shipping,
      message: 'Shipping info updated successfully',
    });
  } catch (error) {
    console.error('❌ Update shipping error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error updating shipping info',
      error: error.message,
    });
  }
};

// ✅ DELETE shipping info (admin)
export const deleteShippingInfo = async (request, reply) => {
  try {
    const { id } = request.params;

    const shipping = await ShippingInfo.findByIdAndDelete(id);

    if (!shipping) {
      return reply.status(404).send({
        success: false,
        message: 'Shipping info not found',
      });
    }

    return reply.status(200).send({
      success: true,
      message: 'Shipping info deleted successfully',
    });
  } catch (error) {
    console.error('❌ Delete shipping error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error deleting shipping info',
      error: error.message,
    });
  }
};