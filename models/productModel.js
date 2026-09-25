// models/productModel.js
import mongoose from 'mongoose';

// 🎯 Tamil-safe slugify — keeps Unicode letters, numbers, marks (virama), dashes
const tamilSafeSlugify = (text) => {
    return text
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}\p{M}\-]+/gu, '')
        .replace(/-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};

const productSchema = new mongoose.Schema({
    // Auto Increment Serial No
    sNo: { type: Number, unique: true, index: true },
    
    // Basic Info
    name: { type: String, required: [true, 'Please enter product name'], trim: true },
    slug: { type: String, unique: true, sparse: true },
    basePrice: { type: Number, required: [true, 'Please enter base price'] },
    originalPrice: { type: Number },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    hasOffer: { type: Boolean, default: false },
    description: { type: String, required: [true, 'Please enter product description'] },
    
    // Category
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: [true, 'Please select a category'] },
    
    // Product Variants
    variants: [{
        variantName: { type: String, required: true, trim: true },
        variantSlug: { type: String, trim: true },
        price: { type: Number, required: true },
        originalPrice: { type: Number },
        description: { type: String, trim: true },
        weight: { type: Number, default: 0 },
        weightUnit: { type: String, enum: ['gram', 'kg', 'ml', 'liter', 'piece'], default: 'gram' },
        stock: { type: Number, required: true, default: 0 },
        images: [{ image: { type: String, required: true } }],
        sku: { type: String, trim: true },
        isDefault: { type: Boolean, default: false },
        status: { type: String, enum: ['active', 'inactive', 'out-of-stock'], default: 'active' },
        discountPercentage: { type: Number, default: 0 },
        features: [String]
    }],
    
    // Specifications
    specifications: [{ key: String, value: String }],
    keyFeatures: [{ type: String, trim: true }],
    
    // Ratings
    rating: { type: Number, default: 0 },
    numberOfReviews: { type: Number, default: 0 },
    
    // Images
    images: [{ image: { type: String, required: true } }],
    
    // Seller
    seller: { type: String, required: [true, 'Please enter seller name'] },
    
    // Stock
    stock: { type: Number, required: true },
    
    // SEO Fields
    metaTitle: { type: String, maxlength: 60 },
    metaDescription: { type: String, maxlength: 160 },
    metaKeywords: { type: [String] },
    canonicalUrl: { type: String },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },
    
    // Status
    status: { type: String, enum: ['active', 'inactive', 'out-of-stock'], default: 'active' },
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Combined pre-save middleware
productSchema.pre('save', async function() {
    // 🎯 Only generate slug if MISSING — never overwrite an existing one
    if (!this.slug || this.slug.trim() === '') {
        let baseSlug = tamilSafeSlugify(this.name);
        if (!baseSlug || baseSlug.trim() === '') {
            baseSlug = `product-${Date.now()}`;
        }

        let slug = baseSlug;
        let counter = 1;
        while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }
        this.slug = slug;
    } else {
        // Uniquify the provided slug if it collides with another product
        let finalSlug = this.slug;
        let counter = 1;
        while (await this.constructor.findOne({ slug: finalSlug, _id: { $ne: this._id } })) {
            finalSlug = `${this.slug}-${counter}`;
            counter++;
        }
        this.slug = finalSlug;
    }

    // 🎯 Generate variant slugs (Tamil-safe)
    if (this.variants && this.variants.length > 0) {
        this.variants.forEach((variant, index) => {
            if (!variant.variantSlug) {
                const variantSlug = tamilSafeSlugify(`${this.name} ${variant.variantName}`);
                variant.variantSlug = `${variantSlug}-${index + 1}`;
            }
        });
    }

    // Calculate total stock from variants
    if (this.variants && this.variants.length > 0) {
        const totalStock = this.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
        this.stock = totalStock;
    }

    // Auto increment S.No
    if (this.isNew) {
        const lastProduct = await this.constructor.findOne({}, {}, { sort: { sNo: -1 } });
        this.sNo = lastProduct ? lastProduct.sNo + 1 : 1;
    }
});

// Indexes
productSchema.index({ category: 1, status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ 'variants.sku': 1 });

export default mongoose.model('Product', productSchema);