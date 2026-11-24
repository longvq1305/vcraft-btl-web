const allowedMethods = new Set(['PUT', 'PATCH', 'DELETE']);

/**
 * Đổi phương thức của form POST trước khi kiểm tra CSRF; multipart lấy giá trị từ query.
 * @type {import('express').RequestHandler}
 */
function methodOverride(req, res, next) {
  if (req.method === 'POST') {
    const requested = req.body?._method ?? req.query._method;
    if (typeof requested === 'string') {
      const method = requested.toUpperCase();
      if (allowedMethods.has(method)) {
        req.method = method;
        if (req.body) delete req.body._method;
      }
    }
  }
  next();
}

module.exports = methodOverride;
