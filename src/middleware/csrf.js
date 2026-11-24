const crypto = require('crypto');

// Chỉ hoãn kiểm tra cho các route có Multer rồi validateCsrf.
const multipartUploadPaths = {
  POST: /^\/artisan\/products(?:\/\d+\/steps)?$/,
  PUT: /^\/artisan\/(?:profile|products\/\d+)$/
};

/**
 * So sánh token gửi lên với token của phiên mà không lộ vị trí khác nhau.
 * @param {unknown} token Token do client gửi.
 * @param {unknown} sessionToken Token được lưu trên máy chủ.
 * @returns {boolean} Hai token hợp lệ và trùng khớp.
 */
function verifyToken(token, sessionToken) {
  if (!token || typeof token !== 'string' || !sessionToken || typeof sessionToken !== 'string') {
    return false;
  }
  const bufA = Buffer.from(token);
  const bufB = Buffer.from(sessionToken);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Trả lỗi CSRF theo định dạng mà client yêu cầu.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {import('express').Response|void}
 */
function rejectCsrf(req, res) {
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(403).json({ error: 'Mã bảo mật CSRF không hợp lệ hoặc đã hết hạn.' });
  }
  return res.status(403).render('errors/403', {
    title: 'Lỗi bảo mật CSRF - 403',
    message: 'Mã xác thực bảo mật (CSRF token) không hợp lệ hoặc đã hết hạn. Vui lòng quay lại, tải lại trang và thử lại.'
  });
}

/**
 * Cấp token cho phiên và kiểm tra mọi yêu cầu ghi, trừ các upload được kiểm sau Multer.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {import('express').Response|void}
 */
function csrfProtection(req, res, next) {
  if (!req.session) {
    return next(new Error('Session middleware must be initialized before CSRF protection'));
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (req.is('multipart/form-data')) {
    if (multipartUploadPaths[req.method]?.test(req.path)) {
      return next();
    }
    if (!verifyToken(req.get('X-CSRF-Token'), req.session.csrfToken)) {
      return rejectCsrf(req, res);
    }
    return next();
  }

  return validateCsrf(req, res, next);
}

/**
 * Kiểm tra token từ body đã parse hoặc header; không nhận token qua URL.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {import('express').Response|void}
 */
function validateCsrf(req, res, next) {
  const token = req.body?._csrf || req.get('X-CSRF-Token');
  if (!verifyToken(token, req.session?.csrfToken)) {
    return rejectCsrf(req, res);
  }
  return next();
}

module.exports = {
  csrfProtection,
  validateCsrf,
  verifyToken
};
