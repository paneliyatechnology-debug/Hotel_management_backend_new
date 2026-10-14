/**
 * S3 Object Storage Service.
 * Manages uploading and deleting room category images in S3-compatible storage.
 */
require('dotenv').config();
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const endpoint = process.env.S3_ENDPOINT || '';
const region = process.env.S3_REGION || 'auto';
const bucket = process.env.S3_BUCKET_NAME || '';
const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';

const s3Client = new S3Client({
  endpoint: endpoint || undefined,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});

/**
 * Generate full public/accessible URL for an image name or S3 key.
 * Handles public content domains for Tigris (tigrisfiles.io), AWS S3, and custom CDN URLs.
 * @param {string} imageNameOrKey
 * @returns {string}
 */
const buildImageUrl = (imageNameOrKey) => {
  if (!imageNameOrKey) return '';

  const customPublicUrl = (process.env.S3_PUBLIC_URL || '').replace(/\/+$/, '');

  // If already a full URL
  if (imageNameOrKey.startsWith('http://') || imageNameOrKey.startsWith('https://')) {
    // If it's an internal Tigris API endpoint, convert to public delivery domain
    if (imageNameOrKey.includes('.storageapi.dev/')) {
      const match = imageNameOrKey.match(/^https?:\/\/([^.]+)\.storageapi\.dev\/([^/]+)\/(.+)$/);
      if (match) {
        const sub = match[1];
        const b = match[2];
        const path = match[3];
        if (customPublicUrl) {
          return `${customPublicUrl}/${path}`;
        }
        return `https://${b}.${sub}.tigrisfiles.io/${path}`;
      }
    }
    return imageNameOrKey;
  }

  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const key = imageNameOrKey.replace(/^\/+/, '');

  if (customPublicUrl) {
    return `${customPublicUrl}/${key}`;
  }

  // Handle Tigris Object Storage public domain (e.g., https://<bucket>.t3.tigrisfiles.io/<key>)
  if (cleanEndpoint.includes('storageapi.dev')) {
    const match = cleanEndpoint.match(/^https?:\/\/([^.]+)\.storageapi\.dev/);
    const sub = match ? match[1] : 't3';
    return `https://${bucket}.${sub}.tigrisfiles.io/${key}`;
  }

  // Handle standard AWS S3 public domain
  if (cleanEndpoint.includes('amazonaws.com')) {
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  if (cleanEndpoint && bucket) {
    return `${cleanEndpoint}/${bucket}/${key}`;
  }
  return `/${key}`;
};

/**
 * Upload single file buffer to S3
 * @param {Object} file - Multer file object
 * @param {string} [folder='room-types'] - S3 target directory
 * @returns {Promise<{ imageName: string, s3Key: string, imageUrl: string }>}
 */
const uploadFile = async (file, folder = 'room-types') => {
  if (!file || !file.buffer) {
    throw new Error('Invalid file payload: file buffer is missing.');
  }

  const extension = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
  const rawBase = path.basename(file.originalname || 'image', extension);
  const safeBaseName = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'image';
  const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const imageName = `${uniquePrefix}-${safeBaseName}${extension}`;
  const s3Key = folder ? `${folder.replace(/\/+$/, '')}/${imageName}` : imageName;

  // In test mode, return generated image metadata without calling live S3 API
  if (process.env.NODE_ENV === 'test') {
    return {
      imageName,
      s3Key,
      imageUrl: buildImageUrl(s3Key),
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype || 'image/jpeg',
    ACL: 'public-read',
  });

  await s3Client.send(command);

  return {
    imageName,
    s3Key,
    imageUrl: buildImageUrl(s3Key),
  };
};

/**
 * Upload multiple files to S3
 * @param {Array<Object>} files
 * @param {string} [folder='room-types']
 * @returns {Promise<Array<{ imageName: string, s3Key: string, imageUrl: string }>>}
 */
const uploadFiles = async (files, folder = 'room-types') => {
  if (!Array.isArray(files) || files.length === 0) return [];
  return Promise.all(files.map((f) => uploadFile(f, folder)));
};

/**
 * Extract S3 object key from a full URL or key string.
 * Supports Tigris (*.tigrisfiles.io, storageapi.dev), AWS S3 (*.amazonaws.com), and custom CDN paths.
 * @param {string} keyOrUrl
 * @returns {string}
 */
const extractS3Key = (keyOrUrl) => {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return '';
  const str = keyOrUrl.trim();

  // Tigris public delivery domain: https://<bucket>.<subdomain>.tigrisfiles.io/<key>
  if (str.includes('.tigrisfiles.io/')) {
    const parts = str.split('.tigrisfiles.io/');
    if (parts[1]) return decodeURIComponent(parts[1].replace(/^\/+/, ''));
  }

  // Tigris authenticated API gateway: https://<subdomain>.storageapi.dev/<bucket>/<key>
  if (str.includes('.storageapi.dev/')) {
    const after = str.split('.storageapi.dev/')[1] || '';
    const slashIdx = after.indexOf('/');
    if (slashIdx !== -1) {
      return decodeURIComponent(after.substring(slashIdx + 1).replace(/^\/+/, ''));
    }
  }

  // Standard AWS S3 URL: https://<bucket>.s3.<region>.amazonaws.com/<key>
  if (str.includes('.amazonaws.com/')) {
    const parts = str.split('.amazonaws.com/');
    if (parts[1]) return decodeURIComponent(parts[1].replace(/^\/+/, ''));
  }

  // Custom public URL base
  if (process.env.S3_PUBLIC_URL && str.startsWith(process.env.S3_PUBLIC_URL)) {
    return decodeURIComponent(str.replace(process.env.S3_PUBLIC_URL, '').replace(/^\/+/, ''));
  }

  // Generic URL fallback
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const parsed = new URL(str);
      let p = parsed.pathname.replace(/^\/+/, '');
      if (bucket && p.startsWith(`${bucket}/`)) {
        p = p.substring(bucket.length + 1);
      }
      return decodeURIComponent(p);
    } catch (_) {
      return '';
    }
  }

  // Already a relative key / path
  return decodeURIComponent(str.replace(/^\/+/, ''));
};

/**
 * Delete an object from S3 using its key or full URL
 * @param {string} s3KeyOrUrl
 * @returns {Promise<void>}
 */
const deleteFile = async (s3KeyOrUrl) => {
  if (process.env.NODE_ENV === 'test') return;
  const s3Key = extractS3Key(s3KeyOrUrl);
  if (!s3Key || !bucket) return;
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });
    await s3Client.send(command);
  } catch (err) {
    console.warn(`[S3] Error deleting object ${s3Key}:`, err.message);
  }
};

module.exports = {
  s3Client,
  buildImageUrl,
  extractS3Key,
  uploadFile,
  uploadFiles,
  deleteFile,
};
