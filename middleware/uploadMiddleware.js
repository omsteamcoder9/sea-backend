import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';

// ─────────────────────────────────────────────
// R2 CLIENT (inline)
// ─────────────────────────────────────────────
const r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Helper: upload buffer to R2
const putToR2 = async (buffer, key, mimetype) => {
    await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
    }));
    return { key, url: `${R2_PUBLIC_URL}/${key}` };
};

// Helper: delete from R2 (accepts full URL or key)
export const deleteFromR2 = async (keyOrUrl) => {
    if (!keyOrUrl) return false;
    try {
        let key = keyOrUrl;

        if (keyOrUrl.startsWith('http')) {
            if (R2_PUBLIC_URL && keyOrUrl.startsWith(R2_PUBLIC_URL)) {
                key = keyOrUrl.replace(`${R2_PUBLIC_URL}/`, '');
            } else {
                const u = new URL(keyOrUrl);
                key = u.pathname.replace(/^\//, '');
            }
        } else if (keyOrUrl.startsWith('/')) {
            key = keyOrUrl.replace(/^\//, '');
        }

        await r2.send(new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        }));
        console.log(`🗑️  Deleted from R2: ${key}`);
        return true;
    } catch (err) {
        console.error('❌ R2 delete error:', err.message);
        return false;
    }
};

// Helper: read stream into Buffer
const streamToBuffer = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });

// 🎯 Smart folder routing based on fieldname
const getFolderForFieldname = (fieldname) => {
    if (fieldname === 'images' || fieldname === 'ogImage') {
        return 'products';
    }
    if (fieldname.includes('variants')) {
        return 'products';
    }
    // 🎯 'image' (singular) is used for category uploads
    if (fieldname === 'categoryImage' || fieldname === 'category' || fieldname === 'image') {
        return 'category';
    }
    if (fieldname === 'bannerImage' || fieldname === 'banner') {
        return 'banner';
    }
    if (fieldname === 'profileImage' || fieldname === 'avatar') {
        return 'users';
    }
    return 'others';
};

// Save uploaded file to R2 under backend-images/<subfolder>/
const saveFileToR2 = async (part, fieldname) => {
    const buffer = await streamToBuffer(part.file);

    const ext = path.extname(part.filename);
    const randomString = crypto.randomBytes(4).toString('hex');
    const safeFieldname = fieldname.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${Date.now()}-${randomString}-${safeFieldname}${ext}`;

    const subfolder = getFolderForFieldname(fieldname);
    const key = `backend-images/${subfolder}/${filename}`;

    const { url } = await putToR2(buffer, key, part.mimetype);

    return {
        filename,
        key,
        url,
        buffer,
        mimetype: part.mimetype,
        fieldname: fieldname,
    };
};

// ─────────────────────────────────────────────
// Fastify upload middleware
// ─────────────────────────────────────────────
export const uploadImages = async (request, reply) => {
    try {
        const files = [];
        const data = {};

        if (!request.body) {
            request.body = {};
        }

        if (request.isMultipart()) {
            const parts = request.parts();

            for await (const part of parts) {
                if (part.file) {
                    const savedFile = await saveFileToR2(part, part.fieldname);
                    files.push(savedFile);
                } else {
                    data[part.fieldname] = part.value;
                }
            }
        }

        Object.assign(request.body, data);
        request.uploadedFiles = files;

        console.log(`📁 Uploaded ${files.length} files to R2 (backend-images/)`);
        console.log('📝 Request body fields:', Object.keys(request.body));
    } catch (error) {
        console.error('❌ Upload middleware error:', error);
        throw error;
    }
};

// ─────────────────────────────────────────────
// Image optimization middleware — keeps same folder
// ─────────────────────────────────────────────
export const optimizeImages = async (request, reply) => {
    try {
        if (!request.uploadedFiles || request.uploadedFiles.length === 0) {
            return;
        }

        const processedFiles = [];

        for (const file of request.uploadedFiles) {
            try {
                const originalBuffer = file.buffer;

                const optimizedBuffer = await sharp(originalBuffer)
                    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 40, effort: 6 })
                    .toBuffer();

                const baseFilename = path.basename(
                    file.filename,
                    path.extname(file.filename)
                );
                const newFilename = baseFilename + '.webp';

                const folder = path.dirname(file.key);
                const newKey = `${folder}/${newFilename}`;

                const { url } = await putToR2(
                    optimizedBuffer,
                    newKey,
                    'image/webp'
                );

                if (file.key !== newKey) {
                    await deleteFromR2(file.key);
                    console.log(`🗑️  Deleted original: ${file.key}`);
                } else {
                    console.log(`♻️  Overwrote original (same key): ${newKey}`);
                }

                processedFiles.push({
                    ...file,
                    filename: newFilename,
                    key: newKey,
                    url,
                    mimetype: 'image/webp',
                    buffer: undefined,
                });

                console.log(`✅ Optimized: ${newKey}`);
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