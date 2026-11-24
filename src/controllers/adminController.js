const User = require('../models/User');
const News = require('../models/News');
const dashboardService = require('../services/dashboardService');
const { ValidationError } = require('../errors/AppError');

const adminController = {
  /**
   * GET /admin — thống kê, danh sách nghệ nhân theo trạng thái và hoạt động gần đây.
   */
  getDashboard(req, res) {
    try {
      const stats = dashboardService.getStats();
      const pendingArtisans = User.listArtisans({ status: 'pending', limit: 20 });
      const approvedArtisans = User.listArtisans({ status: 'approved', limit: 20 });
      const suspendedArtisans = User.listArtisans({ status: 'suspended', limit: 20 });
      const recentProducts = dashboardService.getRecentProducts(10);
      const recentQuotes = dashboardService.getRecentQuotes(10);

      res.render('admin/dashboard', {
        title: 'Bàn Làm Việc Quản Trị Viên - vCraft',
        stats,
        pendingArtisans,
        approvedArtisans,
        suspendedArtisans,
        recentProducts,
        recentQuotes
      });
    } catch (err) {
      console.error('Admin dashboard error:', err);
      res.status(500).render('errors/500', {
        title: 'Lỗi máy chủ',
        message: 'Không thể tải dữ liệu bảng điều khiển quản trị.'
      });
    }
  },

  /** Hiển thị biểu mẫu tạo tài khoản nghệ nhân. */
  getNewArtisan(req, res) {
    res.render('admin/artisan-new', {
      title: 'Tạo Tài Khoản Nghệ Nhân Mới - Quản Trị',
      values: {},
      errors: []
    });
  },

  /** Kiểm tra hồ sơ và tạo tài khoản nghệ nhân đã duyệt. */
  postNewArtisan(req, res) {
    const {
      fullName,
      email,
      password,
      workshopName,
      address,
      phone,
      categories,
      story,
      latitude,
      longitude,
      isOpen,
      visitingHours
    } = req.body;

    const errors = [];
    if (!fullName || !fullName.trim()) errors.push('Vui lòng nhập họ và tên nghệ nhân.');
    if (!email || !email.trim() || !email.includes('@')) errors.push('Vui lòng nhập địa chỉ email hợp lệ.');
    if (!password || password.length < 6) errors.push('Mật khẩu tối thiểu 6 ký tự.');
    if (!workshopName || !workshopName.trim()) errors.push('Vui lòng nhập tên xưởng / thương hiệu thủ công.');
    if (!address || !address.trim()) errors.push('Vui lòng nhập địa chỉ làng nghề.');
    if (!categories || !categories.trim()) errors.push('Vui lòng nhập danh mục nghề thủ công.');

    if (email && email.trim()) {
      const existing = User.findByEmail(email.trim());
      if (existing) {
        errors.push('Địa chỉ email này đã tồn tại trong hệ thống.');
      }
    }

    if (errors.length > 0) {
      return res.status(400).render('admin/artisan-new', {
        title: 'Tạo Tài Khoản Nghệ Nhân Mới - Quản Trị',
        values: req.body,
        errors
      });
    }

    try {
      User.createApprovedArtisanByAdmin({
        fullName,
        email,
        password,
        workshopName,
        address,
        phone,
        categories,
        story,
        latitude: latitude ? parseFloat(latitude) : 21.0285,
        longitude: longitude ? parseFloat(longitude) : 105.8542,
        isOpen: isOpen === '1' || isOpen === 'on' || isOpen === true,
        visitingHours
      });

      if (req.flash) {
        req.flash('success', `Đã tạo thành công tài khoản nghệ nhân "${fullName.trim()}" (Xưởng: ${workshopName.trim()}) và cấp quyền hoạt động ngay!`);
      }
      res.redirect('/admin');
    } catch (err) {
      console.error('Error creating artisan by admin:', err);
      res.status(500).render('admin/artisan-new', {
        title: 'Tạo Tài Khoản Nghệ Nhân Mới - Quản Trị',
        values: req.body,
        errors: ['Không thể tạo tài khoản nghệ nhân. Vui lòng kiểm tra lại dữ liệu.']
      });
    }
  },

  /** Cập nhật trạng thái duyệt của nghệ nhân, kể cả khi khôi phục tài khoản. */
  patchArtisanStatus(req, res, next) {
    const { status } = req.body;
    if (status !== 'approved' && status !== 'suspended') {
      return next(new ValidationError('Trạng thái nghệ nhân phải là approved hoặc suspended.'));
    }

    const id = Number(req.params.id);
    const artisan = User.getArtisanDetail(id);
    if (!artisan) {
      if (req.flash) req.flash('error', 'Không tìm thấy hồ sơ nghệ nhân yêu cầu.');
      return res.redirect('/admin');
    }

    User.updateStatus(id, status);
    if (req.flash) {
      if (status === 'approved') {
        const action = artisan.status === 'suspended' ? 'khôi phục' : 'phê duyệt';
        req.flash('success', `Đã ${action} tài khoản nghệ nhân "${artisan.full_name}".`);
      } else {
        req.flash('info', `Đã tạm ngưng tài khoản nghệ nhân "${artisan.full_name}".`);
      }
    }
    return res.redirect('/admin');
  },

  /** Hiển thị danh sách bản tin cho quản trị viên. */
  getNewsList(req, res) {
    const articles = News.findAllAdmin();
    res.render('admin/news-list', {
      title: 'Quản Lý Bản Tin Làng Nghề - Quản Trị',
      articles
    });
  },

  /** Hiển thị biểu mẫu soạn bản tin. */
  getNewsNew(req, res) {
    res.render('admin/news-form', {
      title: 'Soạn Bản Tin Mới - Quản Trị',
      article: null,
      values: {},
      errors: []
    });
  },

  /** Kiểm tra và lưu bản tin mới. */
  postNewsNew(req, res) {
    const { title, excerpt, body, coverImage, isPublished } = req.body;
    const errors = [];

    if (!title || !title.trim()) errors.push('Vui lòng nhập tiêu đề bản tin.');
    if (!excerpt || !excerpt.trim()) errors.push('Vui lòng nhập tóm tắt ngắn.');
    if (!body || !body.trim()) errors.push('Vui lòng nhập nội dung bản tin.');

    if (errors.length > 0) {
      return res.status(400).render('admin/news-form', {
        title: 'Soạn Bản Tin Mới - Quản Trị',
        article: null,
        values: req.body,
        errors
      });
    }

    try {
      const created = News.create({
        title,
        excerpt,
        body,
        coverImage,
        isPublished: isPublished === '1' || isPublished === 'on' || isPublished === true
      });

      if (req.flash) {
        req.flash('success', 'Đã lưu bản tin thành công!');
      }
      res.redirect('/admin/news');
    } catch (err) {
      console.error('Error creating news:', err);
      res.status(500).render('admin/news-form', {
        title: 'Soạn Bản Tin Mới - Quản Trị',
        article: null,
        values: req.body,
        errors: ['Lỗi khi tạo bản tin.']
      });
    }
  },

  /** Hiển thị biểu mẫu chỉnh sửa bản tin. */
  getNewsEdit(req, res) {
    const id = parseInt(req.params.id, 10);
    const article = News.findById(id);
    if (!article) {
      if (req.flash) req.flash('error', 'Không tìm thấy bài viết yêu cầu.');
      return res.redirect('/admin/news');
    }

    res.render('admin/news-form', {
      title: `Chỉnh sửa: ${article.title} - Quản Trị`,
      article,
      values: article,
      errors: []
    });
  },

  /** Kiểm tra và cập nhật bản tin. */
  postNewsEdit(req, res) {
    const id = parseInt(req.params.id, 10);
    const article = News.findById(id);
    if (!article) {
      if (req.flash) req.flash('error', 'Không tìm thấy bài viết yêu cầu.');
      return res.redirect('/admin/news');
    }

    const { title, excerpt, body, coverImage, isPublished } = req.body;
    const errors = [];

    if (!title || !title.trim()) errors.push('Vui lòng nhập tiêu đề bản tin.');
    if (!excerpt || !excerpt.trim()) errors.push('Vui lòng nhập tóm tắt ngắn.');
    if (!body || !body.trim()) errors.push('Vui lòng nhập nội dung bản tin.');

    if (errors.length > 0) {
      return res.status(400).render('admin/news-form', {
        title: `Chỉnh sửa: ${article.title} - Quản Trị`,
        article,
        values: req.body,
        errors
      });
    }

    try {
      News.update(id, {
        title,
        excerpt,
        body,
        coverImage,
        isPublished: isPublished === '1' || isPublished === 'on' || isPublished === true
      });

      if (req.flash) {
        req.flash('success', 'Đã cập nhật bản tin thành công!');
      }
      res.redirect('/admin/news');
    } catch (err) {
      console.error('Error updating news:', err);
      res.status(500).render('admin/news-form', {
        title: `Chỉnh sửa: ${article.title} - Quản Trị`,
        article,
        values: req.body,
        errors: ['Lỗi khi cập nhật bản tin.']
      });
    }
  },

  /** Xóa bản tin và quay lại danh sách. */
  postNewsDelete(req, res) {
    const id = parseInt(req.params.id, 10);
    News.delete(id);
    if (req.flash) {
      req.flash('success', 'Đã xóa bản tin thành công.');
    }
    res.redirect('/admin/news');
  }
};

module.exports = adminController;
