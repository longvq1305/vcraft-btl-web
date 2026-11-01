const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
sharp.cache(false);

const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Memory storage for safety before Sharp processing
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]);

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    const error = new Error(`Tệp "${file.originalname}" không phải là định dạng hình ảnh hợp lệ (chấp nhận JPEG, PNG, WebP, GIF, AVIF).`);
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
}

const baseMulter = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10 // Max 10 files per request
  }
});

// Middleware wrapper that captures Multer errors and attaches flash/error
function wrapMulter(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) {
        return next();
      }
      let message = 'Lỗi khi tải ảnh lên.';
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = 'Dung lượng ảnh vượt quá giới hạn tối đa cho phép (10MB). Vui lòng chọn ảnh nhỏ hơn.';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          message = 'Số lượng ảnh vượt quá giới hạn cho phép (tối đa 8 ảnh trong thư viện).';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = `Trường tải ảnh không hợp lệ: ${err.field}`;
        } else {
          message = `Lỗi tải ảnh: ${err.message}`;
        }
      } else if (err && err.message) {
        message = err.message;
      }

      req.flash = req.flash || [];
      if (typeof req.flash === 'function') {
        req.flash('error', message);
      }
      req.uploadError = message;

      // Also set flash array on res.locals if present
      if (res.locals && Array.isArray(res.locals.flash)) {
        res.locals.flash.push({ type: 'error', message });
      }

      // Redirect back or return to previous page if it was a POST request
      const returnUrl = req.header('Referer') || req.originalUrl || '/';
      return res.redirect(returnUrl);
    });
  };
}

const uploadProfileImages = wrapMulter(
  baseMulter.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'certificate_image', maxCount: 1 },
    { name: 'gallery_images', maxCount: 8 }
  ])
);

const uploadProductImages = wrapMulter(
  baseMulter.fields([
    { name: 'hero_image', maxCount: 1 },
    { name: 'gallery_images', maxCount: 8 }
  ])
);

const uploadStepImage = wrapMulter(
  baseMulter.single('image')
);

/**
 * Optimizes a single image buffer using Sharp, converts to WebP,
 * applies EXIF rotation, strips metadata, and writes to public/uploads.
 * Returns root-relative path: /uploads/<uuid>.webp
 */
async function processAndSaveImage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Dữ liệu ảnh không hợp lệ.');
  }

  const filename = `${crypto.randomUUID()}.webp`;
  const destinationPath = path.join(UPLOADS_DIR, filename);

  try {
    await sharp(buffer)
      .rotate() // auto-orient based on EXIF
      .resize({
        width: 1600,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toFile(destinationPath);

    return `/uploads/${filename}`;
  } catch (err) {
    if (fs.existsSync(destinationPath)) {
      try {
        fs.unlinkSync(destinationPath);
      } catch (_) {}
    }
    throw new Error(`Không thể xử lý hình ảnh: ${err.message}`);
  }
}

/**
 * Processes multiple image buffers.
 * If any fails, unlinks all files created in this transaction to prevent orphans.
 */
async function processMultipleImages(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    return [];
  }

  const savedPaths = [];
  try {
    for (const buf of buffers) {
      const savedPath = await processAndSaveImage(buf);
      savedPaths.push(savedPath);
    }
    return savedPaths;
  } catch (err) {
    // Cleanup any partially saved files
    for (const p of savedPaths) {
      safeDeleteUpload(p);
    }
    throw err;
  }
}

/**
 * Deletes an uploaded file from disk if it points to a local upload.
 */
function safeDeleteUpload(webPath) {
  if (!webPath || typeof webPath !== 'string') return;
  if (!webPath.startsWith('/uploads/')) return;

  const filename = path.basename(webPath);
  const fullPath = path.join(UPLOADS_DIR, filename);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    // Ignore unlink failure
  }
}

module.exports = {
  uploadProfileImages,
  uploadProductImages,
  uploadStepImage,
  processAndSaveImage,
  processMultipleImages,
  safeDeleteUpload
};
