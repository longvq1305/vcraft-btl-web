const User = require('../models/User');

const authController = {
  getLogin(req, res) {
    if (req.user) {
      if (req.user.role === 'admin') return res.redirect('/admin');
      if (req.user.role === 'artisan') return res.redirect('/artisan/dashboard');
      return res.redirect('/');
    }

    const returnTo = req.query.returnTo || req.session.returnTo || '';
    res.render('auth/login', {
      title: 'Đăng nhập - vCraft',
      returnTo,
      email: '',
      errors: []
    });
  },

  postLogin(req, res) {
    const { email, password, returnTo } = req.body;
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
        returnTo: returnTo || '',
        email: email || '',
        errors
      });
    }

    const user = User.findByEmail(email);
    if (!user || !User.verifyPassword(password, user.password_hash)) {
      return res.status(400).render('auth/login', {
        title: 'Đăng nhập - vCraft',
        returnTo: returnTo || '',
        email: email || '',
        errors: ['Email hoặc mật khẩu không chính xác.']
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).render('auth/login', {
        title: 'Đăng nhập - vCraft',
        returnTo: returnTo || '',
        email: email || '',
        errors: ['Tài khoản của bạn đã bị tạm ngưng hoạt động. Vui lòng liên hệ ban quản trị để được hỗ trợ.']
      });
    }

    // Set user session
    req.session.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    if (req.flash) {
      req.flash('success', `Đăng nhập thành công. Chào mừng trở lại, ${user.full_name}!`);
    }

    const targetUrl = returnTo || req.session.returnTo;
    if (req.session.returnTo) {
      delete req.session.returnTo;
    }

    if (targetUrl && targetUrl.startsWith('/')) {
      return res.redirect(targetUrl);
    }

    if (user.role === 'admin') {
      return res.redirect('/admin');
    }
    if (user.role === 'artisan') {
      return res.redirect('/artisan/dashboard');
    }
    return res.redirect('/');
  },

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

  postRegister(req, res) {
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
    } = req.body;

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

    // Check duplicate email
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

    try {
      if (targetRole === 'buyer') {
        const userId = User.createBuyer({ fullName, email, password });
        req.session.user = {
          id: userId,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role: 'buyer',
          status: 'approved'
        };
        if (req.flash) {
          req.flash('success', 'Đăng ký tài khoản người mua thành công! Chào mừng bạn đến với vCraft.');
        }
        return res.redirect('/');
      } else {
        const userId = User.createArtisanApplicant({
          fullName,
          email,
          password,
          workshopName,
          address,
          phone,
          categories,
          story
        });

        req.session.user = {
          id: userId,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role: 'artisan',
          status: 'pending'
        };

        if (req.flash) {
          req.flash('info', 'Đăng ký tài khoản nghệ nhân thành công! Hồ sơ của bạn đang chờ ban quản trị phê duyệt. Bạn có thể duyệt xem nền tảng nhưng chưa thể mở gian hàng hoặc nhận báo giá cho đến khi được duyệt.');
        }
        return res.redirect('/artisan/dashboard');
      }
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).render('auth/register', {
        title: 'Đăng ký tài khoản - vCraft',
        role: targetRole,
        values: req.body,
        errors: ['Đã có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại.']
      });
    }
  },

  postLogout(req, res) {
    if (req.session) {
      delete req.session.user;
      if (req.flash) {
        req.flash('success', 'Bạn đã đăng xuất thành công.');
      }
    }
    res.redirect('/');
  }
};

module.exports = authController;
