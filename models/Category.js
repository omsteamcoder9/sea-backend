import mongoose from 'mongoose';
import slugify from 'slugify';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  image: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// ✅ ADD THIS pre-save middleware for auto slug generation
categorySchema.pre('save', async function() {
  if (this.isModified('name')) {
    const baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    let slugExists = true;
    
    while (slugExists) {
      const existingCategory = await this.constructor.findOne({ slug });
      if (!existingCategory || existingCategory._id.equals(this._id)) {
        slugExists = false;
      } else {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }
    this.slug = slug;
  }
});

const Category = mongoose.model('Category', categorySchema);
export default Category;