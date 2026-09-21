import mongoose from 'mongoose';

const deliveryBoySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // ✅ Karaikudi wards (existing)
  wardIds: { type: [Number], default: [] },   // Example: [1, 2, 3]
  wardNames: { type: [String], default: [] }, // Ward names for display

  // ✅ NEW: Free-text areas for non-Karaikudi delivery (e.g. "Neyyoor", "Kanyakumari")
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