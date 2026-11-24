const User = require('../models/User');
const { SESSION_COOKIE_NAME } = require('../config/session');

/**
 * Lấy các trường văn bản từ body; giá trị không phải chuỗi (mảng `email[]=`, object) thành chuỗi rỗng.
 * @param {Object} body
 * @param {string[]} names
 * @returns {Object<string, string>}
 */
function textFields(body, names) {
  const result = {};
  for (const name of names) {
    result[name] = typeof body?.[name] === 'string' ? body[name] : '';
  }
  return result;
}

/**
 * Chỉ nhận URL dạng đường dẫn tuyệt đối tính từ gốc ứng dụng, không nhận URL bên ngoài.
 * @param {unknown} url
 * @returns {string} Đường dẫn an toàn hoặc chuỗi rỗng.
 */
function safeReturnTo(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || /[\\\p{Cc}]/u.test(url)) {
    return '';
  }
  return url;
}

/**
 * Lấy đích quay lại hợp lệ, ưu tiên form rồi đến query và phiên cũ.
 * @param {import('express').Request} req
 * @returns {string}
 */
function loginReturnTo(req) {
  return safeReturnTo(req.body?.returnTo) || safeReturnTo(req.query.returnTo) || safeReturnTo(req.session.returnTo);
}

/**
 * Xác định trang đích mặc định theo vai trò.
 * @param {string} role
 * @returns {string}
 */
function roleHome(role) {
  if (role === 'admin') return '/admin';
  if (role === 'artisan') return '/artisan/dashboard';
  return '/';
}

/**
 * Đổi mã phiên sau xác thực, ghi thông báo vào phiên mới và lưu trước khi chuyển trang.
 * Token CSRF mới được middleware cấp ở yêu cầu tiếp theo.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @param {{id: number, fullName: string, email: string, role: string, status: string}} user
 * @param {{redirectTo: string, flashType: string, flashMessage: string}} options
 * @returns {void}
 */
function startAuthenticatedSession(req, res, next, user, { redirectTo, flashType, flashMessage }) {
  req.session.regenerate((err) => {
    if (err) return next(err);

    req.session.user = user;
    req.flash?.(flashType, flashMessage);
    return req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      return res.redirect(redirectTo);
    });
  });
}

const authController = {
  /**
   * Hiển thị form đăng nhập hoặc chuyển người đã đăng nhập đến trang mặc định.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {void}
   */
  getLogin(req, res) {
    if (req.user) {
      return res.redirect(roleHome(req.user.role));
    }

    const returnTo = loginReturnTo(req);
    res.render('auth/login', {
      title: 'Đăng nhập - vCraft',
      returnTo,
      email: '',
      errors: []
    });
  },

  /**
   * Kiểm tra thông tin đăng nhập và tạo phiên mới cho tài khoản hợp lệ.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {void}
   */
  postLogin(req, res, next) {
    const { email, password } = textFields(req.body, ['email', 'password']);
    const returnTo = loginReturnTo(req);
    const errors = [];

    if (!email || !email.trim()) {
      errors.push('Vui lòng nhập địa chỉ email.');
    }
    if (!password) {
      errors.push('Vui lòng nhập mật khẩu.');
    }

    if (errors.length > 0) {
      return res.status(400).render('auth/login', {
        title: 'Đăng nhập - vCraft',
        returnTo,
        email: email || '',
        errors
      });
    }

    const user = User.findByEmail(email);
    if (!user || !User.verifyPassword(password, user.password_hash)) {
      return res.status(400).render('auth/login', {
        title: 'Đăng nhập - vCraft',
        returnTo,
        email: email || '',
        errors: ['Email hoặc mật khẩu không chính xác.']
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).render('auth/login', {
        title: 'Đăng nhập - vCraft',
        returnTo,
        email: email || '',
        errors: ['Tài khoản của bạn đã bị tạm ngưng hoạt động. Vui lòng liên hệ ban quản trị để được hỗ trợ.']
      });
    }

    return startAuthenticatedSession(req, res, next, {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status
    }, {
      redirectTo: returnTo || roleHome(user.role),
      flashType: 'success',
      flashMessage: `Đăng nhập thành công. Chào mừng trở lại, ${user.full_name}!`
    });
  },

  /**
   * Hiển thị form đăng ký với vai trò mặc định được hỗ trợ.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {void}
   */
  getRegister(req, res) {
    if (req.user) {
      return res.redirect('/');
    }

    const defaultRole = req.query.role === 'artisan' ? 'artisan' : 'buyer';
    res.render('auth/register', {
      title: 'Đăng ký tài khoản - vCraft',
      role: defaultRole,
      values: {},
      errors: []
    });
  },

  /**
   * Kiểm tra form, tạo người mua hoặc hồ sơ nghệ nhân rồi mở phiên mới.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {void}
   */
  postRegister(req, res, next) {
    const {
      role,
      fullName,
      email,
      password,
      confirmPassword,
      workshopName,
      address,
      phone,
      categories,
      story
    } = textFields(req.body, [
      'role', 'fullName', 'email', 'password', 'confirmPassword',
      'workshopName', 'address', 'phone', 'categories', 'story'
    ]);

    const errors = [];
    const targetRole = role === 'artisan' ? 'artisan' : 'buyer';

    if (!fullName || !fullName.trim()) {
      errors.push('Vui lòng nhập họ và tên.');
    }
    if (!email || !email.trim() || !email.includes('@')) {
      errors.push('Vui lòng nhập địa chỉ email hợp lệ.');
    }
    if (!password || password.length < 6) {
      errors.push('Mật khẩu phải có độ dài ít nhất 6 ký tự.');
    }
    if (password !== confirmPassword) {
      errors.push('Mật khẩu xác nhận không khớp.');
    }

    if (targetRole === 'artisan') {
      if (!workshopName || !workshopName.trim()) {
        errors.push('Vui lòng nhập tên xưởng thủ công hoặc thương hiệu làng nghề.');
      }
      if (!address || !address.trim()) {
        errors.push('Vui lòng nhập địa chỉ làng nghề / cơ sở chế tác.');
      }
      if (!categories || !categories.trim()) {
        errors.push('Vui lòng nhập nhóm ngành nghề chế tác (ví dụ: Gốm sứ, Lụa tơ tằm).');
      }
    }

    // Kiểm tra email đã đăng ký hay chưa.
    if (email && email.trim()) {
      const existingUser = User.findByEmail(email.trim());
      if (existingUser) {
        errors.push('Địa chỉ email này đã được đăng ký. Vui lòng chọn email khác hoặc đăng nhập.');
      }
    }

    if (errors.length > 0) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản - vCraft',
        role: targetRole,
        values: req.body,
        errors
      });
    }

    let userId;
    try {
      userId = targetRole === 'buyer'
        ? User.createBuyer({ fullName, email, password })
        : User.createArtisanApplicant({
          fullName, email, password, workshopName, address, phone, categories, story
        });
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).render('auth/register', {
        title: 'Đăng ký tài khoản - vCraft',
        role: targetRole,
        values: req.body,
        errors: ['Đã có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại.']
      });
    }

    const isBuyer = targetRole === 'buyer';
    return startAuthenticatedSession(req, res, next, {
      id: userId,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      role: targetRole,
      status: isBuyer ? 'approved' : 'pending'
    }, {
      redirectTo: roleHome(targetRole),
      flashType: isBuyer ? 'success' : 'info',
      flashMessage: isBuyer
        ? 'Đăng ký tài khoản người mua thành công! Chào mừng bạn đến với vCraft.'
        : 'Đăng ký tài khoản nghệ nhân thành công! Hồ sơ của bạn đang chờ ban quản trị phê duyệt. Bạn có thể duyệt xem nền tảng nhưng chưa thể mở gian hàng hoặc nhận báo giá cho đến khi được duyệt.'
    });
  },

  /**
   * Hủy phiên trên máy chủ, xóa cookie và chuyển về trang chủ.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {void}
   */
  postLogout(req, res, next) {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.redirect('/');
    });
  }
};

module.exports = authController;
