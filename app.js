import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const fastify = Fastify({
  logger: true
});

// Connect to MongoDB
connectDB();

// Parse CORS origins from environment variable
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS ;
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

// Register static file serving for uploads folder
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'uploads'),
  prefix: '/uploads/',
  decorateReply: false
});

// Decorate middleware globally
fastify.decorate('requireAdmin', requireAdmin);
fastify.decorate('uploadImages', uploadImages);
fastify.decorate('optimizeImages', optimizeImages);

// Register routes
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(categoryRoutes, { prefix: '/api' });
await fastify.register(productRoutes, { prefix: '/api' });
await fastify.register(cartRoutes, { prefix: '/api' });
await fastify.register(contactRoutes, { prefix: '/api' });
await fastify.register(termsRoutes, { prefix: '/api' });
await fastify.register(privacyRoutes, { prefix: '/api' });
await fastify.register(orderRoutes, { prefix: '/api' });


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
    console.log(`Static files served from: /uploads`);
    console.log(`Contact routes registered at: /api/contacts`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();