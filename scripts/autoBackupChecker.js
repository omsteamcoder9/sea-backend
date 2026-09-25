// scripts/autoBackupChecker.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import BackupService from '../services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);   // ✅ two underscores on both

dotenv.config({ path: path.join(__dirname, '../.env') });

async function autoBackupCheck() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('✅ Connected to MongoDB');
        console.log(
            `🕐 Check Time: ${new Date().toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata'
            })}`
        );
        console.log('🚀 Starting backup...');

        const backupService = new BackupService();

        const result = await backupService.createAndSendBackup();

        if (result.success) {
            console.log('✅ Backup created and sent successfully!');
        } else {
            console.log('❌ Backup failed.');
        }

        await mongoose.disconnect();

        console.log('✅ Disconnected from MongoDB');

        process.exit(0);

    } catch (error) {
        console.error('❌ Auto backup check failed:', error.message);

        try {
            await mongoose.disconnect();
        } catch {}

        process.exit(1);
    }
}

autoBackupCheck();