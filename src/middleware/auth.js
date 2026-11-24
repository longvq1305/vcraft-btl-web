const User = require('../models/User');

/**
 * Nạp người dùng của phiên từ CSDL ở mỗi request để quyền/trạng thái luôn mới nhất.
 * Tài khoản bị tạm ngưng hoặc đã xóa sẽ bị đăng xuất khỏi phiên.
 * Gán `req.user` và `res.locals.currentUser` (null nếu chưa đăng nhập).
 * @type {import('express').RequestHandler}
 */
function attachUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;

  const sessionUserId = req.session && req.session.user && req.session.user.id;
  if (!sessionUserId) {
    return next();
  }

  try {
    const user = User.findById(sessionUserId);
    if (user && user.status !== 'suspended') {
      req.user = {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        status: user.status
      };
      req.session.user = req.user;
      res.locals.currentUser = req.user;
    } else {
      delete req.session.user;
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Chuyển về trang đăng nhập, ghi nhớ URL GET hiện tại để quay lại sau khi đăng nhập.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function redirectToLogin(req, res) {
  if (req.session && req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }
  req.flash('error', 'Vui lòng đăng nhập để tiếp tục.');
  return res.redirect('/auth/login');
}

/**
 * Trả trang 403 với thông điệp cho trước.
 * @param {import('express').Response} res
 * @param {string} title
 * @param {string} message
 */
function renderForbidden(res, title, message) {
  return res.status(403).render('errors/403', { title, message });
}

/**
 * Yêu cầu đã đăng nhập.
 * @type {import('express').RequestHandler}
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return redirectToLogin(req, res);
  }
  return next();
}

/**
 * Yêu cầu đăng nhập và thuộc một trong các vai trò.
 * @param {...('buyer'|'artisan'|'admin')} roles
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return redirectToLogin(req, res);
    }
    if (!roles.includes(req.user.role)) {
      return renderForbidden(res, 'Truy cập bị từ chối - 403', 'Bạn không có quyền truy cập khu vực này.');
    }
    return next();
  };
}

/**
 * Yêu cầu tài khoản nghệ nhân đã được admin phê duyệt.
 * @type {import('express').RequestHandler}
 */
function requireApprovedArtisan(req, res, next) {
  if (!req.user) {
    return redirectToLogin(req, res);
  }

  if (req.user.role !== 'artisan') {
    return renderForbidden(res, 'Truy cập bị từ chối - 403', 'Chức năng này chỉ dành cho tài khoản nghệ nhân.');
  }

  if (req.user.status !== 'approved') {
    const statusText = req.user.status === 'pending' ? 'đang chờ quản trị viên phê duyệt' : 'đã bị tạm ngưng';
    return renderForbidden(
      res,
      'Tài khoản chưa được duyệt - 403',
      `Tài khoản nghệ nhân của bạn ${statusText}. Bạn không thể thực hiện thao tác này cho đến khi tài khoản được kích hoạt.`
    );
  }

  return next();
}

module.exports = {
  attachUser,
  requireAuth,
  requireRole,
  requireApprovedArtisan
};
