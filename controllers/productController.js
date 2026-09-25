import Product from '../models/productModel.js';
import Category from '../models/Category.js';
import mongoose from 'mongoose';
import { deleteFromR2 } from '../middleware/uploadMiddleware.js';

// Helper function to delete image files from R2
const deleteImageFile = async (imagePath) => {
    return await deleteFromR2(imagePath);
};

// 🎯 Extract variant index from Fastify fieldname
const getVariantIndexFromFieldname = (fieldname) => {
    if (!fieldname) return null;

    let match = fieldname.match(/^variants_(\d+)__images$/);
    if (match) return parseInt(match[1]);

    match = fieldname.match(/variants\[(\d+)\]\.images/);
    if (match) return parseInt(match[1]);

    match = fieldname.match(/variants[^0-9]*(\d+)/);
    if (match) return parseInt(match[1]);

    return null;
};

// Get all products
export const getAllProducts = async (request, reply) => {
    try {
        const { category, categorySlug, sortBy = 'createdAt', sortOrder = 'desc', hasOffer } = request.query;

        let filter = {};

        if (hasOffer !== undefined && hasOffer !== '') {
            filter.hasOffer = hasOffer === 'true' || hasOffer === true;
        }

        const categoryFilter = categorySlug || category;

        if (categoryFilter && categoryFilter !== 'undefined' && categoryFilter !== 'all') {
            if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
                filter.category = categoryFilter;
            } else {
                const categoryDoc = await Category.findOne({ slug: categoryFilter, status: 'active' });
                if (categoryDoc) {
                    filter.category = categoryDoc._id;
                } else {
                    return reply.status(200).send({ success: true, data: [], count: 0 });
                }
            }
        }

        const sortConfig = {};
        sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const products = await Product.find(filter)
            .populate('category', 'name slug')
            .sort(sortConfig);

        return reply.status(200).send({ success: true, count: products.length, data: products });
    } catch (error) {
        console.error('Get all products error:', error);
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Get product by ID
export const getProductById = async (request, reply) => {
    try {
        const { id } = request.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return reply.status(400).send({ success: false, message: 'Invalid product ID.' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return reply.status(404).send({ success: false, message: 'Product not found.' });
        }

        return reply.status(200).send({ success: true, data: product });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Get product by slug
export const getProductBySlug = async (request, reply) => {
    try {
        const { slug } = request.params;
        const product = await Product.findOne({ slug }).populate('category', 'name slug');

        if (!product) {
            return reply.status(404).send({ success: false, message: 'Product not found.' });
        }

        return reply.status(200).send({ success: true, data: product });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Create product
export const createProduct = async (request, reply) => {
    try {
        const productData = request.body;
        const files = request.uploadedFiles || [];

        console.log('📥 Received product data:', productData);
        console.log('📁 Uploaded files:', files.length);
        console.log('🔍 File fieldnames:', files.map(f => f.fieldname));

        // Parse JSON fields
        let parsedSpecifications = [];
        if (productData.specifications) {
            parsedSpecifications = typeof productData.specifications === 'string'
                ? JSON.parse(productData.specifications)
                : productData.specifications;
        }

        let parsedKeyFeatures = [];
        if (productData.keyFeatures) {
            if (typeof productData.keyFeatures === 'string') {
                try {
                    parsedKeyFeatures = JSON.parse(productData.keyFeatures);
                } catch (error) {
                    parsedKeyFeatures = productData.keyFeatures.split(',').map(f => f.trim()).filter(f => f);
                }
            } else if (Array.isArray(productData.keyFeatures)) {
                parsedKeyFeatures = productData.keyFeatures;
            }
        }

        let parsedVariants = [];
        if (productData.variants) {
            parsedVariants = typeof productData.variants === 'string'
                ? JSON.parse(productData.variants)
                : productData.variants;
        }

        let parsedMetaKeywords = [];
        if (productData.metaKeywords) {
            if (typeof productData.metaKeywords === 'string') {
                try {
                    parsedMetaKeywords = JSON.parse(productData.metaKeywords);
                } catch (error) {
                    parsedMetaKeywords = productData.metaKeywords.split(',').map(k => k.trim()).filter(k => k);
                }
            } else if (Array.isArray(productData.metaKeywords)) {
                parsedMetaKeywords = productData.metaKeywords;
            }
        }

        // 🎯 Handle main images — store KEY only
        const mainImages = files
            .filter(file => file.fieldname === 'images')
            .map(file => ({ image: file.key }));

        const ogImageFile = files.find(file => file.fieldname === 'ogImage');
        const ogImagePath = ogImageFile ? ogImageFile.key : null;

        // 🎯 Handle variant images — store KEY only
        const variantImagesMap = {};
        files.forEach(file => {
            const variantIndex = getVariantIndexFromFieldname(file.fieldname);
            if (variantIndex !== null) {
                if (!variantImagesMap[variantIndex]) variantImagesMap[variantIndex] = [];
                variantImagesMap[variantIndex].push({ image: file.key });
            }
        });

        console.log('🔍 Variant images map:', variantImagesMap);

        parsedVariants = parsedVariants.map((variant, index) => ({
            ...variant,
            images: variantImagesMap[index] || variant.images || []
        }));

        // Calculate total stock
        const totalStock = parsedVariants.length > 0
            ? parsedVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
            : parseInt(productData.stock) || 0;

        // Handle offer logic
        let finalBasePrice = parseFloat(productData.basePrice);
        let finalOriginalPrice = parseFloat(productData.basePrice);
        let finalDiscountPercentage = 0;
        let finalHasOffer = false;

        if (productData.hasOffer === 'true' || productData.hasOffer === true) {
            if (productData.originalPrice && productData.basePrice) {
                const original = parseFloat(productData.originalPrice);
                const base = parseFloat(productData.basePrice);
                finalHasOffer = true;
                finalOriginalPrice = original;
                finalBasePrice = base;
                finalDiscountPercentage = Math.round(((original - base) / original) * 100 * 100) / 100;
            } else if (productData.originalPrice && productData.discountPercentage) {
                finalHasOffer = true;
                finalOriginalPrice = parseFloat(productData.originalPrice);
                finalDiscountPercentage = parseFloat(productData.discountPercentage);
                finalBasePrice = finalOriginalPrice - (finalOriginalPrice * finalDiscountPercentage / 100);
            } else {
                finalHasOffer = false;
            }
        }

        const product = new Product({
            name: productData.name,
            slug: productData.slug || '',           // 🎯 use frontend-provided slug
            basePrice: finalBasePrice,
            originalPrice: finalOriginalPrice,
            discountPercentage: finalDiscountPercentage,
            hasOffer: finalHasOffer,
            description: productData.description,
            category: productData.category,
            seller: productData.seller,
            stock: totalStock,
            rating: productData.rating || 0,
            numberOfReviews: productData.numberOfReviews || 0,
            specifications: parsedSpecifications,
            keyFeatures: parsedKeyFeatures,
            variants: parsedVariants,
            images: mainImages,
            metaTitle: productData.metaTitle || '',
            metaDescription: productData.metaDescription || '',
            metaKeywords: parsedMetaKeywords,
            canonicalUrl: productData.canonicalUrl || '',
            ogTitle: productData.ogTitle || '',
            ogDescription: productData.ogDescription || '',
            ogImage: ogImagePath,
            status: productData.status || 'active',
            featured: productData.featured === 'true' || productData.featured === true
        });

        const savedProduct = await product.save();

        return reply.status(201).send({
            success: true,
            message: 'Product created successfully',
            data: savedProduct
        });

    } catch (error) {
        console.error('❌ Create Product Error:', error);
        return reply.status(400).send({
            success: false,
            message: error.message
        });
    }
};

// Update product
export const updateProduct = async (request, reply) => {
    try {
        const { id } = request.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return reply.status(400).send({ success: false, message: 'Invalid product ID.' });
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return reply.status(404).send({ success: false, message: 'Product not found.' });
        }

        const updateData = request.body;
        const files = request.uploadedFiles || [];

        console.log('🔍 Update — file fieldnames:', files.map(f => f.fieldname));

        // Handle deleted main images
        if (updateData.deletedMainImages) {
            let deletedImages = updateData.deletedMainImages;

            if (typeof deletedImages === 'string') {
                try {
                    deletedImages = JSON.parse(deletedImages);
                } catch (e) {
                    deletedImages = deletedImages.split(',').map(img => img.trim());
                }
            }
            if (!Array.isArray(deletedImages)) deletedImages = [deletedImages];

            for (const imagePath of deletedImages) {
                await deleteImageFile(imagePath);

                existingProduct.images = existingProduct.images.filter(img => {
                    const imgPath = img.image;
                    return imgPath !== imagePath;
                });
            }

            console.log(`✅ Removed ${deletedImages.length} main images from database`);
        }

        // 🎯 New main images — store KEY only
        const newMainImages = files
            .filter(file => file.fieldname === 'images')
            .map(file => ({ image: file.key }));

        if (newMainImages.length > 0) {
            existingProduct.images.push(...newMainImages);
        }

        // 🎯 OG image — store KEY only
        const ogImageFile = files.find(file => file.fieldname === 'ogImage');
        if (ogImageFile) {
            if (existingProduct.ogImage) {
                await deleteImageFile(existingProduct.ogImage);
            }
            existingProduct.ogImage = ogImageFile.key;
        } else if (updateData.ogImage !== undefined) {
            if (!updateData.ogImage || updateData.ogImage.trim() === '') {
                if (existingProduct.ogImage) {
                    await deleteImageFile(existingProduct.ogImage);
                }
                existingProduct.ogImage = null;
            } else {
                existingProduct.ogImage = updateData.ogImage;
            }
        }

        // 🎯 Build variant images map — store KEY only
        const variantImagesMap = {};
        files.forEach(file => {
            const variantIndex = getVariantIndexFromFieldname(file.fieldname);
            if (variantIndex !== null) {
                if (!variantImagesMap[variantIndex]) variantImagesMap[variantIndex] = [];
                variantImagesMap[variantIndex].push({ image: file.key });
            }
        });

        console.log('🔍 Variant images map:', variantImagesMap);

        // Handle deleted variant images
        let allDeletedImages = [];
        if (updateData.deletedVariantImages) {
            let deletedVariantImages = updateData.deletedVariantImages;
            if (typeof deletedVariantImages === 'string') {
                try {
                    deletedVariantImages = JSON.parse(deletedVariantImages);
                } catch (e) {
                    deletedVariantImages = deletedVariantImages.split(',').map(img => img.trim());
                }
            }

            if (Array.isArray(deletedVariantImages)) {
                allDeletedImages = deletedVariantImages;
            } else if (typeof deletedVariantImages === 'object' && deletedVariantImages !== null) {
                Object.values(deletedVariantImages).forEach(images => {
                    if (Array.isArray(images)) {
                        allDeletedImages.push(...images);
                    } else if (typeof images === 'string') {
                        allDeletedImages.push(images);
                    }
                });
            }

            for (const imagePath of allDeletedImages) {
                await deleteImageFile(imagePath);
            }

            console.log(`✅ Removed ${allDeletedImages.length} variant images from R2`);
        }

        // Handle variants — merge kept old + new
        if (updateData.variants) {
            let parsedVariants = typeof updateData.variants === 'string'
                ? JSON.parse(updateData.variants)
                : updateData.variants;

            parsedVariants = parsedVariants.map((variant, index) => {
                const frontendImages = Array.isArray(variant.images) ? variant.images : [];

                const keptOldImages = frontendImages.filter(img => {
                    const imgPath = img.image || img;
                    return !allDeletedImages.includes(imgPath);
                });

                const newImages = variantImagesMap[index] || [];

                return {
                    ...variant,
                    images: [...keptOldImages, ...newImages]
                };
            });

            existingProduct.variants = parsedVariants;
        }

        // 🎯 Update all fields INCLUDING slug — the model will uniquify it
        const updatableFields = [
            'name', 'slug', 'basePrice', 'originalPrice', 'discountPercentage',
            'hasOffer', 'description', 'category', 'seller',
            'rating', 'numberOfReviews', 'specifications', 'keyFeatures',
            'status', 'featured',
            'metaTitle', 'metaDescription', 'canonicalUrl', 'ogTitle', 'ogDescription',
            'stock'
        ];

        updatableFields.forEach(field => {
            if (updateData[field] !== undefined) {
                if (field === 'specifications' && typeof updateData[field] === 'string') {
                    existingProduct[field] = JSON.parse(updateData[field]);
                } else if (field === 'keyFeatures') {
                    let parsed = updateData[field];
                    if (typeof parsed === 'string') {
                        try {
                            parsed = JSON.parse(parsed);
                        } catch (e) {
                            parsed = parsed.split(',').map(f => f.trim()).filter(f => f);
                        }
                    }
                    existingProduct[field] = parsed;
                } else if (field === 'basePrice' || field === 'originalPrice' || field === 'discountPercentage') {
                    existingProduct[field] = parseFloat(updateData[field]);
                } else if (field === 'hasOffer') {
                    existingProduct[field] = updateData[field] === 'true' || updateData[field] === true;
                } else {
                    existingProduct[field] = updateData[field];
                }
            }
        });

        // Handle metaKeywords
        if (updateData.metaKeywords !== undefined) {
            let parsed = updateData.metaKeywords;
            if (typeof parsed === 'string') {
                try {
                    parsed = JSON.parse(parsed);
                } catch (e) {
                    parsed = parsed.split(',').map(k => k.trim()).filter(k => k);
                }
            }
            existingProduct.metaKeywords = parsed;
        }

        // 🎯 REMOVED: manual slug regeneration block — the model handles it now

        const updatedProduct = await existingProduct.save();

        return reply.status(200).send({
            success: true,
            message: 'Product updated successfully',
            data: updatedProduct
        });

    } catch (error) {
        console.error('❌ Update Product Error:', error);
        return reply.status(500).send({
            success: false,
            message: error.message
        });
    }
};

// Delete product
export const deleteProduct = async (request, reply) => {
    try {
        const { id } = request.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return reply.status(400).send({ success: false, message: 'Invalid product ID.' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return reply.status(404).send({ success: false, message: 'Product not found.' });
        }

        let deletedCount = 0;

        // Delete main images from R2
        if (product.images && product.images.length > 0) {
            for (const img of product.images) {
                if (await deleteImageFile(img.image)) deletedCount++;
            }
        }

        // Delete variant images from R2
        if (product.variants && product.variants.length > 0) {
            for (const variant of product.variants) {
                if (variant.images && variant.images.length > 0) {
                    for (const img of variant.images) {
                        if (await deleteImageFile(img.image)) deletedCount++;
                    }
                }
            }
        }

        // Delete OG image from R2
        if (product.ogImage) {
            if (await deleteImageFile(product.ogImage)) deletedCount++;
        }

        await Product.findByIdAndDelete(id);

        return reply.status(200).send({
            success: true,
            message: `Product deleted. Removed ${deletedCount} image files.`,
            deletedImages: deletedCount
        });

    } catch (error) {
        console.error('❌ Delete Product Error:', error);
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Get featured products
export const getFeaturedProducts = async (request, reply) => {
    try {
        const { priceRange, category, sortBy = 'createdAt', sortOrder = 'desc' } = request.query;

        let filter = { featured: true, status: 'active' };

        if (category && category !== 'all') {
            filter.category = category;
        }

        let priceFilter = {};
        if (priceRange && priceRange !== 'all') {
            switch (priceRange) {
                case '100-200': priceFilter = { basePrice: { $gte: 100, $lte: 200 } }; break;
                case '200-300': priceFilter = { basePrice: { $gte: 200, $lte: 300 } }; break;
                case '300-400': priceFilter = { basePrice: { $gte: 300, $lte: 400 } }; break;
                case '400-500': priceFilter = { basePrice: { $gte: 400, $lte: 500 } }; break;
                case '500-600': priceFilter = { basePrice: { $gte: 500, $lte: 600 } }; break;
                case 'above-600': priceFilter = { basePrice: { $gt: 600 } }; break;
            }
        }

        const finalFilter = { ...filter, ...priceFilter };
        const sortConfig = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const products = await Product.find(finalFilter)
            .populate('category', 'name slug')
            .sort(sortConfig)
            .lean();

        return reply.status(200).send({ success: true, count: products.length, data: products });
    } catch (error) {
        console.error('Featured products error:', error);
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Get featured price ranges
export const getFeaturedPriceRanges = async (request, reply) => {
    try {
        const priceRanges = await Product.aggregate([
            { $match: { featured: true, status: 'active', basePrice: { $exists: true } } },
            {
                $bucket: {
                    groupBy: "$basePrice",
                    boundaries: [0, 100, 200, 300, 400, 500, 600, Number.MAX_SAFE_INTEGER],
                    default: "above-600",
                    output: { count: { $sum: 1 } }
                }
            }
        ]);

        return reply.status(200).send({ success: true, data: priceRanges });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Get filtered featured products
export const getFilteredFeaturedProducts = async (request, reply) => {
    try {
        const { priceRanges, categories, page = 1, limit = 12, sortBy = 'createdAt', sortOrder = 'desc' } = request.query;

        let filter = { featured: true, status: 'active' };

        if (categories && categories !== 'all') {
            const categoryArray = Array.isArray(categories) ? categories : [categories];
            filter.category = { $in: categoryArray };
        }

        const sortConfig = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [products, totalCount] = await Promise.all([
            Product.find(filter)
                .populate('category', 'name slug')
                .sort(sortConfig)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Product.countDocuments(filter)
        ]);

        return reply.status(200).send({
            success: true,
            data: products,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalProducts: totalCount
            }
        });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Search products
export const searchProducts = async (request, reply) => {
    try {
        const { search, category, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 12 } = request.query;

        let filter = { status: 'active' };

        if (search && search.trim() !== '') {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'all') {
            filter.category = category;
        }

        if (minPrice || maxPrice) {
            filter.basePrice = {};
            if (minPrice) filter.basePrice.$gte = parseFloat(minPrice);
            if (maxPrice) filter.basePrice.$lte = parseFloat(maxPrice);
        }

        const sortConfig = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [products, totalCount] = await Promise.all([
            Product.find(filter).populate('category', 'name slug').sort(sortConfig).skip(skip).limit(parseInt(limit)).lean(),
            Product.countDocuments(filter)
        ]);

        return reply.status(200).send({
            success: true,
            data: products,
            count: products.length,
            totalCount,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalProducts: totalCount
            }
        });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};

// Quick search products
export const quickSearchProducts = async (request, reply) => {
    try {
        const { q: searchQuery, limit = 5 } = request.query;

        if (!searchQuery || searchQuery.trim() === '') {
            return reply.status(200).send({ success: true, data: [] });
        }

        const products = await Product.find({
            name: { $regex: searchQuery.trim(), $options: 'i' },
            status: 'active'
        })
            .select('name slug basePrice images ogImage category featured variants')
            .populate('category', 'name slug')
            .limit(parseInt(limit))
            .lean();

        const formattedProducts = products.map(product => ({
            _id: product._id,
            name: product.name,
            slug: product.slug,
            price: product.basePrice,
            image: 
                product.images?.[0]?.image 
                || product.variants?.[0]?.images?.[0]?.image 
                || product.variants?.find(v => v.isDefault)?.images?.[0]?.image 
                || product.ogImage,
            category: product.category?.name || 'Uncategorized',
            featured: product.featured || false
        }));

        return reply.status(200).send({ success: true, data: formattedProducts, count: formattedProducts.length });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};
// Get offer products
export const getOfferProducts = async (request, reply) => {
    try {
        const { category, minDiscount = 0, maxDiscount = 100, limit = 20, sort = 'discount-desc' } = request.query;

        const filter = {
            hasOffer: true,
            discountPercentage: { $gte: parseFloat(minDiscount), $lte: parseFloat(maxDiscount) },
            status: 'active'
        };

        if (category && category !== 'all') {
            filter.category = category;
        }

        let sortConfig = {};
        switch (sort) {
            case 'discount-desc': sortConfig = { discountPercentage: -1 }; break;
            case 'price-asc': sortConfig = { basePrice: 1 }; break;
            case 'price-desc': sortConfig = { basePrice: -1 }; break;
            case 'new': sortConfig = { createdAt: -1 }; break;
            default: sortConfig = { discountPercentage: -1 };
        }

        const products = await Product.find(filter)
            .populate('category', 'name slug')
            .sort(sortConfig)
            .limit(parseInt(limit))
            .lean();

        const formattedProducts = products.map(product => ({
            ...product,
            savingsAmount: product.originalPrice - product.basePrice,
            hasOffer: true
        }));

        return reply.status(200).send({ success: true, count: products.length, data: formattedProducts });
    } catch (error) {
        return reply.status(500).send({ success: false, message: error.message });
    }
};