import { 
    getAllProducts,
    getProductById,
    getProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getFeaturedProducts,
    getFeaturedPriceRanges,
    getFilteredFeaturedProducts,
    searchProducts,
    quickSearchProducts,
    getOfferProducts
} from '../controllers/productController.js';

async function productRoutes(fastify, options) {
    
    // Public routes (no auth)
    fastify.get('/products', getAllProducts);
    fastify.get('/products/featured', getFeaturedProducts);
    fastify.get('/products/featured/price-ranges', getFeaturedPriceRanges);
    fastify.get('/products/featured/filter', getFilteredFeaturedProducts);
    fastify.get('/products/search', searchProducts);
    fastify.get('/products/quick-search', quickSearchProducts);
    fastify.get('/products/offers', getOfferProducts);
    
    // Create product (Admin only)
    fastify.post('/products', {
        preHandler: [fastify.requireAdmin, fastify.uploadImages, fastify.optimizeImages]
    }, createProduct);
    
    // Update product (Admin only)
    fastify.put('/products/:id', {
        preHandler: [fastify.requireAdmin, fastify.uploadImages, fastify.optimizeImages]
    }, updateProduct);
    
    // Delete product (Admin only)
    fastify.delete('/products/:id', {
        preHandler: [fastify.requireAdmin]
    }, deleteProduct);
    
    // Get by slug (must be before /:id)
    fastify.get('/products/slug/:slug', getProductBySlug);
    
    // Get by ID (last)
    fastify.get('/products/:id', getProductById);
}

export default productRoutes;