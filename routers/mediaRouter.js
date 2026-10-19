/**
 * Short image links. The browser asks for /media/<folder>/<file>
 * and this route reads the private bucket object.
 */
const express = require('express');
const { openStoredObject } = require('../services/s3Service');

const router = express.Router();

const decodeKey = (pathname) => {
  const raw = String(pathname || '').replace(/^\/+/, '');
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return '';
  }
};

router.get('/*', async (req, res, next) => {
  try {
    const object = await openStoredObject(decodeKey(req.path));
    if (!object || !object.Body) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (object.ContentLength != null) {
      res.setHeader('Content-Length', String(object.ContentLength));
    }
    object.Body.pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
