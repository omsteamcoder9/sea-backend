import Cart from '../models/Cart.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';

// Helper function to get product details
const getProductDetails = async (productId, variantId) => {
  const product = await Product.findById(productId);
  if (!product) return null;

  let price = product.basePrice;
  let originalPrice = product.originalPrice || product.basePrice;
  let variantName = '';
  let productName = product.name;
  let productImage = product.images?.[0]?.image || '';

  if (variantId) {
    const variant = product.variants?.find(v => 
      v._id?.toString() === variantId || v.variantName === variantId
    );
    if (variant) {
      price = variant.price;
      originalPrice = variant.originalPrice || variant.price;
      variantName = variant.variantName;
    }
  }

  return { price, originalPrice, variantName, productName, productImage };
};

// Add to Cart
export const addToCart = async (request, reply) => {
  try {
    const { productId, quantity = 1, variantId, guestId } = request.body;
    
    // Get user ID if authenticated
    let userId = null;
    if (request.user && request.user.userId) {
      userId = request.user.userId;
    }
    
    // Validate product
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid product ID'
      });
    }
    
    const product = await Product.findById(productId);
    if (!product) {
      return reply.status(404).send({
        success: false,
        message: 'Product not found'
      });
    }
    
    // ✅ DEFINE THESE VARIABLES FIRST
    let selectedPrice = product.basePrice;
    let availableStock = product.stock;
    let variantName = '';
    
    // If variant is selected, get variant details
    if (variantId) {
      const variant = product.variants?.find(v => 
        v._id?.toString() === variantId || v.variantName === variantId
      );
      if (variant) {
        selectedPrice = variant.price;
        availableStock = variant.stock;
        variantName = variant.variantName || variant.name || '';
      }
    }
    
    // Check stock
    if (availableStock < quantity) {
      return reply.status(400).send({
        success: false,
        message: 'Insufficient stock'
      });
    }
    
    // Find or create cart
    let cart;
    if (userId) {
      cart = await Cart.findOne({ user: userId });
    } else if (guestId) {
      cart = await Cart.findOne({ guestId });
    }
    
    if (!cart) {
      cart = new Cart({
        user: userId || null,
        guestId: guestId || null,
        items: []
      });
    }
    
    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(item => {
      const sameProduct = item.product.toString() === productId;
      const sameVariant = item.variantId === (variantId || '');
      return sameProduct && sameVariant;
    });
    
    if (existingItemIndex > -1) {
      // Update existing item
      cart.items[existingItemIndex].quantity = quantity;
      cart.items[existingItemIndex].price = selectedPrice;
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity,
        price: selectedPrice,
        originalPrice: selectedPrice,
        variantId: variantId || '',
        variantName: variantName,
        productName: product.name,
        productImage: product.images?.[0]?.image || ''
      });
    }
    
    // Save cart (pre-save middleware will calculate totals)
    await cart.save();
    
    // Populate product details
    await cart.populate('items.product', 'name basePrice images slug stock');
    
    return reply.status(200).send({
      success: true,
      data: cart,
      guestId: guestId
    });
    
  } catch (error) {
    console.error('Add to Cart Error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Get Cart (authenticated or guest)
export const getCart = async (request, reply) => {
  try {
    let cart;
    
    if (request.user && request.user.userId) {
      // Authenticated user
      cart = await Cart.findOne({ user: request.user.userId })
        .populate('items.product', 'name basePrice images slug stock seller variants');
    } else {
      // Guest user
      const { guestId } = request.query;
      if (!guestId) {
        return reply.status(200).send({
          success: true,
          data: {
            items: [],
            totalItems: 0,
            totalPrice: 0
          }
        });
      }
      cart = await Cart.findOne({ guestId })
        .populate('items.product', 'name basePrice images slug stock seller variants');
    }

    if (!cart) {
      return reply.status(200).send({
        success: true,
        data: {
          items: [],
          totalItems: 0,
          totalPrice: 0
        }
      });
    }

    return reply.status(200).send({
      success: true,
      data: cart
    });

  } catch (error) {
    console.error('Get Cart Error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Merge guest cart with user cart after login
export const mergeCart = async (request, reply) => {
  try {
    const userId = request.user.userId;
    const { guestId } = request.body;

    if (!guestId) {
      return reply.status(400).send({
        success: false,
        message: 'Guest ID is required'
      });
    }

    // Get guest cart
    const guestCart = await Cart.findOne({ guestId });
    if (!guestCart || guestCart.items.length === 0) {
      return reply.status(200).send({
        success: true,
        message: 'No items to merge',
        data: await Cart.findOne({ user: userId })
      });
    }

    // Get or create user cart
    let userCart = await Cart.findOne({ user: userId });
    if (!userCart) {
      userCart = new Cart({
        user: userId,
        items: [],
        totalItems: 0,
        totalPrice: 0
      });
    }

    // Merge guest items into user cart
    for (const guestItem of guestCart.items) {
      const existingItemIndex = userCart.items.findIndex(item => {
        const sameProduct = item.product.toString() === guestItem.product.toString();
        const sameVariant = item.variantId === guestItem.variantId;
        return sameProduct && sameVariant;
      });

      if (existingItemIndex > -1) {
        // Update quantity if item exists
        userCart.items[existingItemIndex].quantity += guestItem.quantity;
      } else {
        // Add new item
        userCart.items.push({
          product: guestItem.product,
          quantity: guestItem.quantity,
          price: guestItem.price,
          originalPrice: guestItem.originalPrice,
          variantId: guestItem.variantId,
          variantName: guestItem.variantName,
          productName: guestItem.productName,
          productImage: guestItem.productImage
        });
      }
    }

    await userCart.save();
    
    // Delete guest cart
    await Cart.deleteOne({ guestId });

    await userCart.populate('items.product', 'name basePrice images slug stock seller variants');

    return reply.status(200).send({
      success: true,
      message: 'Cart merged successfully',
      data: userCart
    });

  } catch (error) {
    console.error('Merge Cart Error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Update Cart Item Quantity
export const updateCartItem = async (request, reply) => {
  try {
    const { itemId } = request.params;
    const { quantity } = request.body;
    const userId = request.user?.userId;
    const { guestId } = request.body;

    if (!quantity || quantity < 1) {
      return reply.status(400).send({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }

    let cart;
    if (userId) {
      cart = await Cart.findOne({ user: userId });
    } else if (guestId) {
      cart = await Cart.findOne({ guestId });
    }

    if (!cart) {
      return reply.status(404).send({
        success: false,
        message: 'Cart not found'
      });
    }

    const cartItem = cart.items.id(itemId);
    if (!cartItem) {
      return reply.status(404).send({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Check stock
    const product = await Product.findById(cartItem.product);
    let availableStock = product.stock;
    if (cartItem.variantId) {
      const variant = product.variants?.find(v => 
        v._id?.toString() === cartItem.variantId || v.variantName === cartItem.variantId
      );
      if (variant) availableStock = variant.stock;
    }

    if (availableStock < quantity) {
      return reply.status(400).send({
        success: false,
        message: 'Insufficient stock'
      });
    }

    cartItem.quantity = quantity;
    await cart.save();
    
    await cart.populate('items.product', 'name basePrice images slug stock seller variants');

    return reply.status(200).send({
      success: true,
      data: cart
    });

  } catch (error) {
    console.error('Update Cart Error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Remove Item from Cart
export const removeFromCart = async (request, reply) => {
  try {
    const { itemId } = request.params;
    const userId = request.user?.userId;
    const { guestId } = request.body;

    let cart;
    if (userId) {
      cart = await Cart.findOne({ user: userId });
    } else if (guestId) {
      cart = await Cart.findOne({ guestId });
    }

    if (!cart) {
      return reply.status(404).send({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items.pull(itemId);
    await cart.save();
    
    await cart.populate('items.product', 'name basePrice images slug stock seller variants');

    return reply.status(200).send({
      success: true,
      data: cart
    });

  } catch (error) {
    console.error('Remove from Cart Error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};

// Clear Cart
export const clearCart = async (request, reply) => {
  try {
    const userId = request.user?.userId;
    const { guestId } = request.body;

    let cart;
    if (userId) {
      cart = await Cart.findOne({ user: userId });
    } else if (guestId) {
      cart = await Cart.findOne({ guestId });
    }

    if (!cart) {
      return reply.status(404).send({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    await cart.save();

    return reply.status(200).send({
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });

  } catch (error) {
    console.error('Clear Cart Error:', error);
    return reply.status(500).send({
      success: false,
      message: error.message
    });
  }
};