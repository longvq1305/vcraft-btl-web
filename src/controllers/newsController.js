const News = require('../models/News');

const newsController = {
  getIndex(req, res) {
    try {
      const articles = News.findPublished({ limit: 30 });
      res.render('news/index', {
        title: 'Bản Tin & Văn Hóa Làng Nghề - vCraft',
        articles
      });
    } catch (err) {
      console.error('Error fetching public news:', err);
      res.status(500).render('errors/500', {
        title: 'Lỗi tải bản tin',
        message: 'Không thể tải danh sách bản tin làng nghề lúc này.'
      });
    }
  },

  getDetail(req, res) {
    try {
      const { slug } = req.params;
      const article = News.findBySlug(slug);

      if (!article) {
        return res.status(404).render('errors/404', {
          title: 'Không tìm thấy bài viết - 404',
          message: 'Bài viết bản tin bạn đang tìm kiếm không tồn tại hoặc đã bị gỡ.'
        });
      }

      // If unpublished and current user is not admin, deny access
      if (!article.is_published && (!req.user || req.user.role !== 'admin')) {
        return res.status(404).render('errors/404', {
          title: 'Không tìm thấy bài viết - 404',
          message: 'Bài viết này hiện chưa được công khai.'
        });
      }

      // Fetch other recent published articles for sidebar
      const recentArticles = News.findPublished({ limit: 4 }).filter(a => a.id !== article.id);

      res.render('news/detail', {
        title: `${article.title} - vCraft`,
        article,
        recentArticles
      });
    } catch (err) {
      console.error('Error fetching news detail:', err);
      res.status(500).render('errors/500', {
        title: 'Lỗi tải bài viết',
        message: 'Đã có lỗi xảy ra khi tải bài viết.'
      });
    }
  }
};

module.exports = newsController;
