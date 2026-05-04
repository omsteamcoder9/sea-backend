import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Helper to save uploaded file
const saveFile = async (part, fieldname) => {
    const ext = path.extname(part.filename);
    const randomString = crypto.randomBytes(4).toString('hex');
    const safeFieldname = fieldname.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${Date.now()}-${randomString}-${safeFieldname}${ext}`;
    const filePath = path.join(uploadDir, filename);
    
    // Save the file
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(part.file, writeStream);
    
    return {
        filename,
        path: filePath,
        mimetype: part.mimetype,
        fieldname: fieldname
    };
};

// Fastify upload middleware
export const uploadImages = async (request, reply) => {
    try {
        const files = [];
        const data = {};
        
        // Initialize request.body if it doesn't exist
        if (!request.body) {
            request.body = {};
        }
        
        // Check if request is multipart
        if (request.isMultipart()) {
            const parts = request.parts();
            
            for await (const part of parts) {
                if (part.file) {
                    // This is a file
                    const savedFile = await saveFile(part, part.fieldname);
                    files.push(savedFile);
                } else {
                    // This is a field
                    data[part.fieldname] = part.value;
                }
            }
        }
        
        // Merge data into request.body
        Object.assign(request.body, data);
        request.uploadedFiles = files;
        
        console.log(`📁 Uploaded ${files.length} files`);
        console.log('📝 Request body fields:', Object.keys(request.body));
        
    } catch (error) {
        console.error('❌ Upload middleware error:', error);
        throw error;
    }
};

// Image optimization middleware
export const optimizeImages = async (request, reply) => {
    try {
        if (!request.uploadedFiles || request.uploadedFiles.length === 0) {
            return;
        }
        
        const processedFiles = [];
        
        for (const file of request.uploadedFiles) {
            const originalPath = file.path;
            const baseFilename = path.basename(file.filename, path.extname(file.filename));
            const newFilename = baseFilename + '.webp';
            const outputPath = path.join(uploadDir, newFilename);
            
            try {
                const metadata = await sharp(originalPath).metadata();
                let targetWidth = Math.min(400, metadata.width);
                let targetHeight = Math.min(400, metadata.height);
                
                await sharp(originalPath)
                    .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 40, effort: 6 })
                    .toFile(outputPath);
                
                // Delete original file
                if (fs.existsSync(originalPath)) {
                    fs.unlinkSync(originalPath);
                }
                
                processedFiles.push({
                    ...file,
                    filename: newFilename,
                    path: outputPath,
                    mimetype: 'image/webp'
                });
                
                console.log(`✅ Optimized: ${newFilename}`);
                
            } catch (error) {
                console.error(`Failed to optimize ${file.filename}:`, error);
                processedFiles.push(file);
            }
        }
        
        request.uploadedFiles = processedFiles;
        
    } catch (error) {
        console.error('❌ Optimize middleware error:', error);
    }
};