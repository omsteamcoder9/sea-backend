import mongoose from 'mongoose';

const deliveryBoySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  wardId: { type: Number, required: true },
  wardName: { type: String, required: true },
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