import Category from '../models/Category.js';

// Create a new category
export const createCategory = async (request, reply) => {
  try {
    const { name } = request.body;

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

    const category = await Category.create({ name });

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

// Update category
export const updateCategory = async (request, reply) => {
  try {
    const { id } = request.params;
    const { name } = request.body;

    if (!name) {
      return reply.status(400).send({
        success: false,
        message: 'Category name is required'
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

    const category = await Category.findByIdAndUpdate(
      id,
      { name },
      { new: true, runValidators: true }
    );

    if (!category) {
      return reply.status(404).send({
        success: false,
        message: 'Category not found'
      });
    }

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
    const category = await Category.findByIdAndDelete(id);

    if (!category) {
      return reply.status(404).send({
        success: false,
        message: 'Category not found'
      });
    }

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