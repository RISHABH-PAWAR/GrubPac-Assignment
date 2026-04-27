const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const { badRequest } = require('../utils/response.util');

const ALLOWED_MIME  = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);
const ALLOWED_EXT   = new Set(['.jpg', '.jpeg', '.png', '.gif']);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
    const err = new Error('Only JPG, JPEG, PNG, and GIF files are allowed');
    err.code  = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

const handleUploadError = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return badRequest(res, `File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }
    return badRequest(res, `Upload error: ${err.message}`);
  }
  if (err && err.code === 'INVALID_FILE_TYPE') {
    return badRequest(res, err.message);
  }
  next(err);
};

const MIME_TO_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/gif':  'gif',
};

const getFileType = (mimetype) => MIME_TO_TYPE[mimetype] || 'jpg';

const buildFileUrl = (filename) => {
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/uploads/${filename}`;
};

module.exports = { upload, handleUploadError, getFileType, buildFileUrl, UPLOAD_DIR };
