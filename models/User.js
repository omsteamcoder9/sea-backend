import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // For OTP-based users (regular users)
  phoneNumber: {
    type: String,
    sparse: true,  // Allows null/undefined for admin users
    unique: true,
    trim: true
  },
  
  // For admin users
  email: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    select: false  // Don't return password by default
  },
  
  // Role field
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    required: true
  },
  
  // Common fields
  name: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

export default User;