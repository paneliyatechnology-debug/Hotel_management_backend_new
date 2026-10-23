/**
 * Older image links used /media/<folder>/<file>.
 * Those files now live under uploads, and this route serves them from there.
 */
const express = require('express');
const { resolveLocalPath } = require('../services/uploadService');

const router = express.Router();

const decodeKey = (pathname) => {
  const raw = String(pathname || '').replace(/^\/+/, '');
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return '';
  }
};

router.get('/*', (req, res) => {
  const filePath = resolveLocalPath(decodeKey(req.path));
  if (!filePath) {
    return res.status(404).json({
      success: false,
      message: 'File not found',
    });
  }

  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath, (err) => {
    if (!err || res.headersSent) return;
    res.status(404).json({
      success: false,
      message: 'File not found',
    });
  });
});

module.exports = router;
