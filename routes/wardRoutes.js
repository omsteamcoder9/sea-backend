import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function wardRoutes(fastify, options) {
  
  // GET all ward data
  fastify.get('/wards', async (request, reply) => {
    try {
      const wardFilePath = path.join(__dirname, '../data/Karaikudi_Wards.json');
      
      if (!fs.existsSync(wardFilePath)) {
        return reply.status(404).send({
          success: false,
          message: 'Ward data not found'
        });
      }
      
      const wardData = JSON.parse(fs.readFileSync(wardFilePath, 'utf8'));
      
      return reply.status(200).send({
        success: true,
        data: wardData
      });
    } catch (error) {
      console.error('Error loading ward data:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to load ward data'
      });
    }
  });

  // GET wards list only
  fastify.get('/wards/list', async (request, reply) => {
    try {
      const wardFilePath = path.join(__dirname, '../data/Karaikudi_Wards.json');
      
      if (!fs.existsSync(wardFilePath)) {
        return reply.status(404).send({
          success: false,
          message: 'Ward data not found'
        });
      }
      
      const wardData = JSON.parse(fs.readFileSync(wardFilePath, 'utf8'));
      
      // Return only ward ID and name (lightweight)
      const wardsList = wardData.wards.map(ward => ({
        wardId: ward.wardId,
        wardName: ward.wardName,
        streets: ward.streets
      }));
      
      return reply.status(200).send({
        success: true,
        data: wardsList
      });
    } catch (error) {
      console.error('Error loading ward data:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to load ward data'
      });
    }
  });

  // GET streets by ward ID
  fastify.get('/wards/:wardId/streets', async (request, reply) => {
    try {
      const { wardId } = request.params;
      const wardFilePath = path.join(__dirname, '../data/Karaikudi_Wards.json');
      
      if (!fs.existsSync(wardFilePath)) {
        return reply.status(404).send({
          success: false,
          message: 'Ward data not found'
        });
      }
      
      const wardData = JSON.parse(fs.readFileSync(wardFilePath, 'utf8'));
      const ward = wardData.wards.find(w => w.wardId === parseInt(wardId));
      
      if (!ward) {
        return reply.status(404).send({
          success: false,
          message: `Ward ${wardId} not found`
        });
      }
      
      return reply.status(200).send({
        success: true,
        data: {
          wardId: ward.wardId,
          wardName: ward.wardName,
          streets: ward.streets
        }
      });
    } catch (error) {
      console.error('Error loading ward data:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to load ward data'
      });
    }
  });
}