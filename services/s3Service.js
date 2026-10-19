/**
 * S3 Object Storage Service.
 * Manages uploading and deleting room category images in S3-compatible storage.
 */
require('dotenv').config();
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const { getPublicBase } = require('../utils/requestContext');

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
  // Railway buckets reject the default checksum headers on signed downloads.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const MEDIA_PREFIXES = [
  'bookings/images/',
  'bookings/signatures/',
  'rooms/',
  'room-types/',
  'hotels/logos/',
];

/**
 * Guest photos, signatures, room pictures, and hotel logos only.
 * @param {string} key
 * @returns {boolean}
 */
const isAllowedMediaKey = (key) => {
  if (!key || typeof key !== 'string') return false;
  if (key.includes('..') || key.includes('\\') || key.includes('\0')) return false;
  return MEDIA_PREFIXES.some((prefix) => key.startsWith(prefix));
};

/**
 * Host used in image links. An explicit API_PUBLIC_URL wins.
 * Otherwise the host of the current API request is used, so local and deployed links stay correct.
 * @returns {string}
 */
const resolvePublicBase = () => {
  const configured = (process.env.API_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const fromRequest = getPublicBase();
  if (fromRequest) return fromRequest;
  const railway = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (railway) return `https://${railway}`;
  return `http://127.0.0.1:${process.env.PORT || 5001}`;
};

/**
 * Short stable image address, for example /media/hotels/logos/logo.png
 * @param {string} key
 * @returns {string}
 */
const buildMediaUrl = (key) => {
  const encoded = key.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${resolvePublicBase()}/media/${encoded}`;
};

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
 * True when the address points at this app's bucket rather than an outside website.
 * @param {string} value
 * @returns {boolean}
 */
const isOwnStorageUrl = (value) => {
  const str = String(value);
  const publicBase = (process.env.S3_PUBLIC_URL || '').replace(/\/+$/, '');
  return str.includes('.tigrisfiles.io/')
    || str.includes('.storageapi.dev/')
    || str.includes('.storage.dev/')
    || str.includes('.amazonaws.com/')
    || Boolean(publicBase && str.startsWith(publicBase));
};

/**
 * URL a browser can open for a stored image.
 * Railway buckets are private, so the tigrisfiles.io address returns AccessDenied.
 * The response link is a short /media/... address. The server reads the private file for that path.
 * @param {string} imageNameOrKey
 * @returns {Promise<string>}
 */
const getAccessibleUrl = async (imageNameOrKey) => {
  if (!imageNameOrKey) return '';
  const raw = String(imageNameOrKey).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) && !isOwnStorageUrl(raw) && !isMediaAddress(raw)) return raw;
  if ((process.env.S3_PUBLIC_URL || '').trim()) return buildImageUrl(raw);

  const key = extractS3Key(raw);
  if (!isAllowedMediaKey(key)) return /^https?:\/\//i.test(raw) ? raw : '';
  return buildMediaUrl(key);
};

/**
 * True when the path is one of this API's /media links.
 * @param {string} value
 * @returns {boolean}
 */
const isMediaAddress = (value) => {
  const str = String(value || '');
  if (str.startsWith('/media/')) return isAllowedMediaKey(safeDecode(str.slice('/media/'.length)));
  try {
    return isAllowedMediaKey(safeDecode(new URL(str).pathname.replace(/^\/media\//, '')));
  } catch (_) {
    return false;
  }
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return '';
  }
};

/**
 * Read one private object for the public /media route.
 * @param {string} key
 * @returns {Promise<import('@aws-sdk/client-s3').GetObjectCommandOutput|null>}
 */
const openStoredObject = async (key) => {
  if (!isAllowedMediaKey(key) || !bucket) return null;
  try {
    return await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    if (err.name === 'NoSuchKey' || status === 404) return null;
    throw err;
  }
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

  const input = {
    Bucket: bucket,
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype || 'image/jpeg',
  };

  try {
    await s3Client.send(new PutObjectCommand({ ...input, ACL: 'public-read' }));
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    const denied = status === 403 || err.name === 'AccessDenied' || err.Code === 'AccessDenied';
    if (!denied) throw err;
    // This bucket does not allow a public file. Store it as private; responses use /media links.
    await s3Client.send(new PutObjectCommand(input));
  }

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
  const str = keyOrUrl.trim().split('#')[0].split('?')[0];

  if (str.startsWith('/media/')) {
    return safeDecode(str.slice('/media/'.length));
  }
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const pathname = new URL(str).pathname;
      if (pathname.startsWith('/media/')) return safeDecode(pathname.slice('/media/'.length));
    } catch (_) {
      return '';
    }
  }

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
  getAccessibleUrl,
  isAllowedMediaKey,
  openStoredObject,
  extractS3Key,
  uploadFile,
  uploadFiles,
  deleteFile,
};
