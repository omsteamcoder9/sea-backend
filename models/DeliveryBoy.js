import mongoose from 'mongoose';

const deliveryBoySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // ✅ NEW: which city this delivery boy belongs to
  city: { type: String, default: '' },   // 'karaikudi' | 'pudukkottai' | ''

  // Wards (belong to `city` above)
  wardIds: { type: [Number], default: [] },
  wardNames: { type: [String], default: [] },

  // Free-text areas for non-ward delivery
  areas: { type: [String], default: [] },

  vehicleType: { type: String, enum: ['bike', 'car', 'scooter'], default: 'bike' },
  vehicleNumber: { type: String, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  isVerified: { type: Boolean, default: true },
  totalEarnings: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const DeliveryBoy = mongoose.model('DeliveryBoy', deliveryBoySchema);
export default DeliveryBoy;