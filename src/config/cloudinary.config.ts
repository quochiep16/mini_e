// src/config/cloudinary.config.ts
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

// Đọc env và config Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Log nhẹ để debug (chỉ in *** cho secret)
console.log('Cloudinary config loaded:', {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? '***' : undefined,
});

export { cloudinary };
