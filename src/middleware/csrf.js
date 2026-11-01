const crypto = require('crypto');

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

  const token = req.body?._csrf || req.query?._csrf || req.headers['x-csrf-token'];

  // If this is a multipart request where body hasn't been parsed yet and no query/header token is present,
  // allow route-level handlers to parse body first then validate, or validate if token is present
  if (req.is('multipart/form-data') && !token && (!req.body || Object.keys(req.body).length === 0)) {
    return next();
  }

  if (!verifyToken(token, req.session.csrfToken)) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(403).json({ error: 'Mã bảo mật CSRF không hợp lệ hoặc đã hết hạn.' });
    }
    return res.status(403).render('errors/403', {
      title: 'Lỗi bảo mật CSRF - 403',
      message: 'Mã xác thực bảo mật (CSRF token) không hợp lệ hoặc đã hết hạn. Vui lòng quay lại, tải lại trang và thử lại.'
    });
  }

  next();
}

function validateCsrf(req, res, next) {
  const token = req.body?._csrf || req.query?._csrf || req.headers['x-csrf-token'];
  if (!req.session || !verifyToken(token, req.session.csrfToken)) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(403).json({ error: 'Mã bảo mật CSRF không hợp lệ hoặc đã hết hạn.' });
    }
    return res.status(403).render('errors/403', {
      title: 'Lỗi bảo mật CSRF - 403',
      message: 'Mã xác thực bảo mật (CSRF token) không hợp lệ hoặc đã hết hạn. Vui lòng quay lại, tải lại trang và thử lại.'
    });
  }
  next();
}

module.exports = {
  csrfProtection,
  validateCsrf,
  verifyToken
};
