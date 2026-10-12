/**
 * S3 Object Storage Service.
 * Manages uploading and deleting room category images in S3-compatible storage.
 * Follows TradeNexa service pattern.
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
 * @param {string} imageNameOrKey
 * @returns {string}
 */
const buildImageUrl = (imageNameOrKey) => {
  if (!imageNameOrKey) return '';
  if (imageNameOrKey.startsWith('http://') || imageNameOrKey.startsWith('https://')) {
    return imageNameOrKey;
  }

  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const key = imageNameOrKey.replace(/^\/+/, '');

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

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype || 'image/jpeg',
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
 * Delete an object from S3
 * @param {string} s3Key
 * @returns {Promise<void>}
 */
const deleteFile = async (s3Key) => {
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
  uploadFile,
  uploadFiles,
  deleteFile,
};
