const { db } = require('../config/database');

function attachUser(req, res, next) {
  try {
    if (req.session && req.session.user && req.session.user.id) {
      const user = db.prepare('SELECT id, full_name, email, role, status FROM users WHERE id = ?').get(req.session.user.id);
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
        req.user = null;
        res.locals.currentUser = null;
      }
    } else {
      req.user = null;
      res.locals.currentUser = null;
    }
  } catch (err) {
    req.user = null;
    res.locals.currentUser = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.session) {
      if (req.method === 'GET') {
        req.session.returnTo = req.originalUrl;
      }
      if (req.flash) {
        req.flash('error', 'Vui lòng đăng nhập để tiếp tục.');
      }
    }
    return res.redirect('/auth/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.session) {
        if (req.method === 'GET') {
          req.session.returnTo = req.originalUrl;
        }
        if (req.flash) {
          req.flash('error', 'Vui lòng đăng nhập để tiếp tục.');
        }
      }
      return res.redirect('/auth/login');
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).render('errors/403', {
        title: 'Truy cập bị từ chối - 403',
        message: 'Bạn không có quyền truy cập khu vực này.'
      });
    }

    next();
  };
}

function requireApprovedArtisan(req, res, next) {
  if (!req.user) {
    if (req.session) {
      if (req.method === 'GET') {
        req.session.returnTo = req.originalUrl;
      }
      if (req.flash) {
        req.flash('error', 'Vui lòng đăng nhập để tiếp tục.');
      }
    }
    return res.redirect('/auth/login');
  }

  if (req.user.role !== 'artisan') {
    return res.status(403).render('errors/403', {
      title: 'Truy cập bị từ chối - 403',
      message: 'Chức năng này chỉ dành cho tài khoản nghệ nhân.'
    });
  }

  if (req.user.status !== 'approved') {
    const statusText = req.user.status === 'pending' ? 'đang chờ quản trị viên phê duyệt' : 'đã bị tạm ngưng';
    return res.status(403).render('errors/403', {
      title: 'Tài khoản chưa được duyệt - 403',
      message: `Tài khoản nghệ nhân của bạn ${statusText}. Bạn không thể thực hiện thao tác này cho đến khi tài khoản được kích hoạt.`
    });
  }

  next();
}

module.exports = {
  attachUser,
  requireAuth,
  requireRole,
  requireApprovedArtisan
};
