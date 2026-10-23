/**
 * Multer file upload middleware.
 * Uses memory storage so the upload service can write the file under uploads/.
 */
const multer = require('multer');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/avif',
  ];

  if (allowedMimeTypes.includes(file.mimetype.toLowerCase()) || file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type '${file.mimetype}'. Only image files (JPEG, PNG, WebP, GIF, SVG, AVIF) are allowed.`,
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file. The number of files per request is not limited.
  },
  fileFilter,
});

/**
 * Middleware that accepts images from 'images', 'images[]', or any field name in form-data.
 */
const uploadRoomImages = (req, res, next) => {
  const handler = upload.any();
  handler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError('Image file is too large. Maximum size allowed is 10MB.', HTTP_STATUS.BAD_REQUEST)
          );
        }
        return next(new AppError(`Upload error: ${err.message}`, HTTP_STATUS.BAD_REQUEST));
      }
      return next(err);
    }
    next();
  });
};

module.exports = {
  uploadRoomImages,
};
