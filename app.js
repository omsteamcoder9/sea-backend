import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rawBody from 'fastify-raw-body';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import { requireAdmin } from './controllers/authController.js';
import { uploadImages, optimizeImages } from './middleware/uploadMiddleware.js';
import cartRoutes from './routes/cartRoutes.js';
import termsRoutes from './routes/termsRoutes.js';
import privacyRoutes from './routes/privacyRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import adminUserRoutes from './routes/adminUserRoutes.js';
import wardRoutes from './routes/wardRoutes.js';


// ✅ ADD THESE IMPORTS FOR DELIVERY BOY
import deliveryRoutes from './routes/deliveryRoutes.js';
import adminDeliveryRoutes from './routes/adminDeliveryRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const fastify = Fastify({
  logger: true
});

await fastify.register(rawBody, {
  field: 'rawBody',
  global: false,
  encoding: 'utf8',
  runFirst: true,
});

// ADD HERE
fastify.addHook('onRequest', async (request, reply) => {
  console.log('================================');
  console.log('REQUEST RECEIVED');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  console.log('================================');
});

// Connect to MongoDB
connectDB();

// Parse CORS origins from environment variable
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS;
  // Split by comma and trim whitespace
  return origins.split(',').map(origin => origin.trim());
};

// Register plugins
await fastify.register(cors, {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET
});

await fastify.register(multipart, {
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
  }
});

// ❌ REMOVED: fastify-static serving of local uploads folder
// Images are now served directly from Cloudflare R2 public URL

// Decorate middleware globally
fastify.decorate('requireAdmin', requireAdmin);
fastify.decorate('uploadImages', uploadImages);
fastify.decorate('optimizeImages', optimizeImages);

// ADD TEST ROUTE HERE
fastify.get('/api/test', async (request, reply) => {
  return {
    success: true,
    message: 'Server working'
  };
});

// Register routes
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(categoryRoutes, { prefix: '/api' });
await fastify.register(productRoutes, { prefix: '/api' });
await fastify.register(cartRoutes, { prefix: '/api' });
await fastify.register(contactRoutes, { prefix: '/api' });
await fastify.register(termsRoutes, { prefix: '/api' });
await fastify.register(privacyRoutes, { prefix: '/api' });
await fastify.register(orderRoutes, { prefix: '/api' });
await fastify.register(paymentRoutes, { prefix: '/api' });
await fastify.register(settingsRoutes, { prefix: '/api' });
await fastify.register(statsRoutes, { prefix: '/api' });
await fastify.register(adminUserRoutes, { prefix: '/api' });
await fastify.register(wardRoutes, { prefix: '/api' });


// ✅ ADD DELIVERY BOY ROUTES
await fastify.register(deliveryRoutes, { prefix: '/api' });
await fastify.register(adminDeliveryRoutes, { prefix: '/api' });

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  console.error(error);
  reply.status(error.statusCode || 500).send({
    success: false,
    message: error.message || 'Internal server error'
  });
});

const start = async () => {
  try {
    await fastify.listen({ 
      port: process.env.PORT || 3000, 
      host: process.env.HOST || '0.0.0.0' 
    });
    console.log(`Server running on port ${process.env.PORT || 3000}`);
    console.log(`CORS enabled for origins: ${getAllowedOrigins().join(', ')}`);
    console.log(`✅ Images served from Cloudflare R2`);
    console.log(`Contact routes registered at: /api/contacts`);
    console.log(`Stats routes registered at: /api/stats`);
    console.log(`✅ Delivery boy routes registered at: /api/delivery`);
    console.log(`✅ Admin delivery routes registered at: /api/admin/delivery-boys`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();