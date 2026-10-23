/**
 * Local image storage.
 * Guest photos, signatures, room pictures, and hotel logos are saved under uploads/
 * and served at /uploads/<folder>/<file>.
 */
const fs = require('fs');
const path = require('path');
const { getPublicBase } = require('../utils/requestContext');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

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
 * Otherwise the host of the current API request is used.
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

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return '';
  }
};

/**
 * Relative path stored for a file, for example rooms/photo.jpg.
 * Accepts a bare key, an /uploads or /media path, or an older full storage URL.
 * @param {string} keyOrUrl
 * @returns {string}
 */
const extractStorageKey = (keyOrUrl) => {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return '';
  const str = keyOrUrl.trim().split('#')[0].split('?')[0];
  if (!str) return '';

  const fromPath = (pathname) => {
    const clean = safeDecode(String(pathname || '').replace(/^\/+/, ''));
    if (clean.startsWith('uploads/')) return clean.slice('uploads/'.length);
    if (clean.startsWith('media/')) return clean.slice('media/'.length);
    return clean;
  };

  if (str.startsWith('/uploads/') || str.startsWith('/media/')) {
    return fromPath(str);
  }

  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const pathname = new URL(str).pathname;
      if (pathname.includes('/uploads/') || pathname.includes('/media/')) return fromPath(pathname);
    } catch (_) {
      return '';
    }

    if (str.includes('.tigrisfiles.io/')) {
      const parts = str.split('.tigrisfiles.io/');
      if (parts[1]) return safeDecode(parts[1].replace(/^\/+/, ''));
    }
    if (str.includes('.storageapi.dev/')) {
      const after = str.split('.storageapi.dev/')[1] || '';
      const slashIdx = after.indexOf('/');
      if (slashIdx !== -1) return safeDecode(after.slice(slashIdx + 1).replace(/^\/+/, ''));
    }
    if (str.includes('.amazonaws.com/')) {
      const parts = str.split('.amazonaws.com/');
      if (parts[1]) return safeDecode(parts[1].replace(/^\/+/, ''));
    }
    return '';
  }

  return safeDecode(str.replace(/^\/+/, ''));
};

/**
 * @param {string} key
 * @returns {string}
 */
const buildImageUrl = (key) => {
  if (!key) return '';
  const encoded = String(key).split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${resolvePublicBase()}/uploads/${encoded}`;
};

/**
 * True when the address is one of this API's stored files, including older /media links.
 * @param {string} value
 * @returns {boolean}
 */
const isOwnStorageUrl = (value) => {
  const str = String(value || '');
  if (str.startsWith('/uploads/') || str.startsWith('/media/')) return true;
  if (
    str.includes('.tigrisfiles.io/')
    || str.includes('.storageapi.dev/')
    || str.includes('.storage.dev/')
    || str.includes('.amazonaws.com/')
  ) return true;
  try {
    const pathname = new URL(str).pathname;
    return pathname.startsWith('/uploads/') || pathname.startsWith('/media/');
  } catch (_) {
    return false;
  }
};

/**
 * URL a browser can open for a stored image.
 * Older S3 and /media values are rewritten to /uploads on this API.
 * @param {string} imageNameOrKey
 * @returns {Promise<string>}
 */
const getAccessibleUrl = async (imageNameOrKey) => {
  if (!imageNameOrKey) return '';
  const raw = String(imageNameOrKey).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) && !isOwnStorageUrl(raw)) return raw;

  const key = extractStorageKey(raw);
  if (!isAllowedMediaKey(key)) return /^https?:\/\//i.test(raw) ? raw : '';
  return buildImageUrl(key);
};

/**
 * Absolute path of an allowed file inside uploads, or null.
 * @param {string} keyOrUrl
 * @returns {string|null}
 */
const resolveLocalPath = (keyOrUrl) => {
  const key = extractStorageKey(keyOrUrl);
  if (!isAllowedMediaKey(key)) return null;
  const root = path.resolve(UPLOAD_ROOT);
  const filePath = path.resolve(root, key);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  return filePath;
};

/**
 * Save one uploaded image under uploads/<folder>.
 * @param {Object} file - Multer file object
 * @param {string} [folder='room-types']
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
  const storageKey = folder ? `${folder.replace(/\/+$/, '')}/${imageName}` : imageName;

  if (!isAllowedMediaKey(storageKey)) {
    throw new Error('This folder is not available for image uploads.');
  }

  if (process.env.NODE_ENV !== 'test') {
    const filePath = resolveLocalPath(storageKey);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.buffer);
  }

  return {
    imageName,
    s3Key: storageKey,
    imageUrl: buildImageUrl(storageKey),
  };
};

/**
 * @param {Array<Object>} files
 * @param {string} [folder='room-types']
 * @returns {Promise<Array<{ imageName: string, s3Key: string, imageUrl: string }>>}
 */
const uploadFiles = async (files, folder = 'room-types') => {
  if (!Array.isArray(files) || files.length === 0) return [];
  const saved = [];
  for (const file of files) {
    saved.push(await uploadFile(file, folder));
  }
  return saved;
};

/**
 * Delete a stored image by its key or URL. A missing file is ignored.
 * @param {string} keyOrUrl
 * @returns {Promise<void>}
 */
const deleteFile = async (keyOrUrl) => {
  if (process.env.NODE_ENV === 'test') return;
  const filePath = resolveLocalPath(keyOrUrl);
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[Upload] Could not delete ${filePath}:`, err.message);
    }
  }
};

module.exports = {
  UPLOAD_ROOT,
  buildImageUrl,
  getAccessibleUrl,
  isAllowedMediaKey,
  resolveLocalPath,
  extractStorageKey,
  uploadFile,
  uploadFiles,
  deleteFile,
};
