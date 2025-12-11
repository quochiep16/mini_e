// src/common/config/cloudinary.config.ts
import { v2 as cloudinary } from 'cloudinary';

console.log('Cloudinary config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? '***' : undefined,
  api_secret: process.env.CLOUDINARY_API_SECRET ? '***' : undefined,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };
