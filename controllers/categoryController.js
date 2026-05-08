import Category from '../models/Category.js';
import fs from 'fs';
import path from 'path';

// Helper function to delete image file
const deleteImageFile = (imagePath) => {
  if (!imagePath) return false;
  try {
    let filename = '';
    if (imagePath.includes('/uploads/')) {
      const parts = imagePath.split('/uploads/');
      filename = parts[parts.length - 1];
    } else {
      filename = path.basename(imagePath);
    }
    
    const uploadsFolder = path.join(process.cwd(), 'uploads');
    const exactFilePath = path.join(uploadsFolder, filename);
    
    if (fs.existsSync(exactFilePath)) {
      fs.unlinkSync(exactFilePath);
      console.log(`✅ Deleted category image: ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error deleting category image:', error);
    return false;
  }
};

// Create a new category (with image upload)
export const createCategory = async (request, reply) => {
  try {
    const { name } = request.body;
    const files = request.uploadedFiles || [];
    
    if (!name) {
      return reply.status(400).send({
        success: false,
        message: 'Category name is required'
      });
    }

    // Check if category already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return reply.status(400).send({
        success: false,
        message: 'Category already exists'
      });
    }

    // Get uploaded image
    const imageFile = files.find(file => file.fieldname === 'image');
    const imagePath = imageFile ? `/uploads/${imageFile.filename}` : null;

    const category = await Category.create({ 
      name, 
      image: imagePath 
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

    if (!name) {
      return reply.status(400).send({
        success: false,
        message: 'Category name is required'
      });
    }

    // Check if category exists
    const category = await Category.findById(id);
    if (!category) {
      return reply.status(404).send({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if new name already exists (excluding current category)
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

    // Handle image deletion if new image is uploaded or image is being removed
    const imageFile = files.find(file => file.fieldname === 'image');
    const { deleteImage } = request.body;

    // If deleteImage is true, remove existing image
    if (deleteImage === 'true' || deleteImage === true) {
      if (category.image) {
        deleteImageFile(category.image);
        category.image = null;
      }
    }

    // If new image is uploaded, delete old one and set new one
    if (imageFile) {
      if (category.image) {
        deleteImageFile(category.image);
      }
      category.image = `/uploads/${imageFile.filename}`;
    }

    // Update name
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

    // Delete associated image file if exists
    if (category.image) {
      deleteImageFile(category.image);
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