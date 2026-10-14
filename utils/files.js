/**
 * Uploaded file helpers.
 */

/**
 * Keep only the uploaded files that are images.
 * @param {Array<Object>} files - Files from multer
 * @returns {Array<Object>}
 */
const extractImageFiles = (files) => {
  if (!Array.isArray(files) || files.length === 0) return [];
  return files.filter(
    (file) =>
      file &&
      file.buffer &&
      (file.mimetype?.startsWith('image/') ||
        ['images', 'images[]', 'image'].includes(file.fieldname))
  );
};

module.exports = {
  extractImageFiles,
};
