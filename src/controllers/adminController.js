const { db } = require('../config/database');
const User = require('../models/User');
const News = require('../models/News');

const adminController = {
  getDashboard(req, res) {
    try {
      // 1. User and Artisan counts
      const userCounts = db.prepare(`
        SELECT role, status, COUNT(*) as count
        FROM users
        GROUP BY role, status
      `).all();

      const stats = {
        totalUsers: 0,
        buyers: 0,
        artisansPending: 0,
        artisansApproved: 0,
        artisansSuspended: 0,
        productsTotal: 0,
        productsPublished: 0,
        quotesTotal: 0,
        quotesBidding: 0,
        quotesAccepted: 0,
        quotesDelivered: 0,
        newsTotal: 0,
        newsPublished: 0
      };

      for (const row of userCounts) {
        stats.totalUsers += row.count;
        if (row.role === 'buyer') {
          stats.buyers += row.count;
        } else if (row.role === 'artisan') {
          if (row.status === 'pending') stats.artisansPending += row.count;
          else if (row.status === 'approved') stats.artisansApproved += row.count;
          else if (row.status === 'suspended') stats.artisansSuspended += row.count;
        }
      }

      // 2. Product counts
      const prodStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published
        FROM products
      `).get();
      if (prodStats) {
        stats.productsTotal = prodStats.total || 0;
        stats.productsPublished = prodStats.published || 0;
      }

      // 3. Quote counts
      const quoteStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('sent', 'bidding') THEN 1 ELSE 0 END) as bidding,
          SUM(CASE WHEN status IN ('accepted', 'in_production') THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
        FROM quote_requests
      `).get();
      if (quoteStats) {
        stats.quotesTotal = quoteStats.total || 0;
        stats.quotesBidding = quoteStats.bidding || 0;
        stats.quotesAccepted = quoteStats.accepted || 0;
        stats.quotesDelivered = quoteStats.delivered || 0;
      }

      // 4. News counts
      stats.newsTotal = News.countAll();
      stats.newsPublished = News.countPublished();

      // 5. Pending artisans list
      const pendingArtisans = User.listArtisans({ status: 'pending', limit: 20 });

      // 6. Approved artisans list
      const approvedArtisans = User.listArtisans({ status: 'approved', limit: 20 });

      // 7. Recent products
      const recentProducts = db.prepare(`
        SELECT p.id, p.name, p.slug, p.category, p.price, p.inventory, p.status, p.created_at,
               u.full_name as artisan_name, ap.workshop_name
        FROM products p
        JOIN users u ON p.artisan_id = u.id
        LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
        ORDER BY p.created_at DESC
        LIMIT 10
      `).all();

      // 8. Recent quotes
      const recentQuotes = db.prepare(`
        SELECT q.id, q.title, q.category, q.quantity, q.status, q.deadline, q.created_at,
               u.full_name as buyer_name, u.email as buyer_email,
               (SELECT COUNT(*) FROM bids b WHERE b.quote_id = q.id) as bid_count
        FROM quote_requests q
        JOIN users u ON q.buyer_id = u.id
        ORDER BY q.created_at DESC
        LIMIT 10
      `).all();

      res.render('admin/dashboard', {
        title: 'Bàn Làm Việc Quản Trị Viên - vCraft',
        stats,
        pendingArtisans,
        approvedArtisans,
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

  getNewArtisan(req, res) {
    res.render('admin/artisan-new', {
      title: 'Tạo Tài Khoản Nghệ Nhân Mới - Quản Trị',
      values: {},
      errors: []
    });
  },

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

  postApproveArtisan(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      if (req.flash) req.flash('error', 'ID nghệ nhân không hợp lệ.');
      return res.redirect('/admin');
    }

    const artisan = User.getArtisanDetail(id);
    if (!artisan) {
      if (req.flash) req.flash('error', 'Không tìm thấy hồ sơ nghệ nhân yêu cầu.');
      return res.redirect('/admin');
    }

    User.updateStatus(id, 'approved');
    if (req.flash) {
      req.flash('success', `Đã phê duyệt tài khoản nghệ nhân "${artisan.full_name}" (${artisan.workshop_name || 'Xưởng thủ công'}). Tài khoản đã được kích hoạt.`);
    }
    res.redirect('/admin');
  },

  postSuspendArtisan(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      if (req.flash) req.flash('error', 'ID nghệ nhân không hợp lệ.');
      return res.redirect('/admin');
    }

    const artisan = User.getArtisanDetail(id);
    if (!artisan) {
      if (req.flash) req.flash('error', 'Không tìm thấy hồ sơ nghệ nhân yêu cầu.');
      return res.redirect('/admin');
    }

    User.updateStatus(id, 'suspended');
    if (req.flash) {
      req.flash('info', `Đã tạm ngưng tài khoản nghệ nhân "${artisan.full_name}".`);
    }
    res.redirect('/admin');
  },

  // News Admin Operations
  getNewsList(req, res) {
    const articles = News.findAllAdmin();
    res.render('admin/news-list', {
      title: 'Quản Lý Bản Tin Làng Nghề - Quản Trị',
      articles
    });
  },

  getNewsNew(req, res) {
    res.render('admin/news-form', {
      title: 'Soạn Bản Tin Mới - Quản Trị',
      article: null,
      values: {},
      errors: []
    });
  },

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
