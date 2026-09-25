import Category from '../models/Category.js';
import { deleteFromR2 } from '../middleware/uploadMiddleware.js';

// Helper: delete image from R2 (accepts full URL, /uploads/... path, or key)
const deleteImageFile = async (imagePath) => {
  return await deleteFromR2(imagePath);
};

// Create a new category (with image upload)
export const createCategory = async (request, reply) => {
  try {
    const { name } = request.body;
    const files = request.uploadedFiles || [];

    console.log('🔍 Category create — file fieldnames:', files.map(f => f.fieldname));

    if (!name) {
      return reply.status(400).send({
        success: false,
        message: 'Category name is required'
      });
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return reply.status(400).send({
        success: false,
        message: 'Category already exists'
      });
    }

    // 🎯 Store only the R2 key
    const imageFile = files.find(file => file.fieldname === 'image');
    const imageKey = imageFile ? imageFile.key : null;

    const category = await Category.create({
      name,
      image: imageKey
    });

    return reply.status(201).send({
      success: true,
      message: 'Category created successfully',
      category
    });

  } catch (error) {
    console.error('Create category error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all categories
export const getAllCategories = async (request, reply) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });

    return reply.status(200).send({
      success: true,
      categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single category by ID
export const getCategoryById = async (request, reply) => {
  try {
    const { id } = request.params;
    const category = await Category.findById(id);

    if (!category) {
      return reply.status(404).send({
        success: false,
        message: 'Category not found'
      });
    }

    return reply.status(200).send({
      success: true,
      category
    });

  } catch (error) {
    console.error('Get category error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update category (with image upload)
export const updateCategory = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name } = request.body;
    const files = request.uploadedFiles || [];

    console.log('🔍 Category update — file fieldnames:', files.map(f => f.fieldname));

    if (!name) {
      return reply.status(400).send({
        success: false,
        message: 'Category name is required'
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return reply.status(404).send({
        success: false,
        message: 'Category not found'
      });
    }

    const existingCategory = await Category.findOne({
      name,
      _id: { $ne: id }
    });

    if (existingCategory) {
      return reply.status(400).send({
        success: false,
        message: 'Category name already exists'
      });
    }

    const imageFile = files.find(file => file.fieldname === 'image');
    const { deleteImage } = request.body;

    // If deleteImage is true, remove existing image from R2
    if (deleteImage === 'true' || deleteImage === true) {
      if (category.image) {
        await deleteImageFile(category.image);
        category.image = null;
      }
    }

    // If new image uploaded, delete old one from R2 and set new KEY
    if (imageFile) {
      if (category.image) {
        await deleteImageFile(category.image);
      }
      category.image = imageFile.key;
    }

    category.name = name;

    await category.save();

    return reply.status(200).send({
      success: true,
      message: 'Category updated successfully',
      category
    });

  } catch (error) {
    console.error('Update category error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete category
export const deleteCategory = async (request, reply) => {
  try {
    const { id } = request.params;
    const category = await Category.findById(id);

    if (!category) {
      return reply.status(404).send({
        success: false,
        message: 'Category not found'
      });
    }

    if (category.image) {
      await deleteImageFile(category.image);
    }

    await Category.findByIdAndDelete(id);

    return reply.status(200).send({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Delete category error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Internal server error'
    });
  }
};