// routes/contactRoutes.js
import {
  createContact,
  getContacts,
  getContact,
  updateContact,
  deleteContact
} from '../controllers/contactController.js';

async function contactRoutes(fastify, options) {
  // Public routes
  fastify.post('/contacts', createContact);
  
  // Protected routes (add authentication as needed)
  // For now, these are public as per your original code
  fastify.get('/contacts', getContacts);
  fastify.get('/contacts/:id', getContact);
  fastify.put('/contacts/:id', updateContact);
  fastify.delete('/contacts/:id', deleteContact);
}

export default contactRoutes;