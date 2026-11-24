const Artisan = require('../models/Artisan');
const Product = require('../models/Product');
const News = require('../models/News');

const publicController = {
  /**
   * GET / — trang chủ: tác phẩm, xưởng nổi bật, danh mục và 3 bản tin mới nhất.
   */
  home(req, res, next) {
    try {
      const featuredProducts = Product.findFeatured(8);
      const featuredWorkshops = Artisan.findFeatured(4);
      const categories = Product.findDistinctCategories();
      const latestNews = News.findPublished({ limit: 3 });

      res.render('home', {
        title: 'vCraft - Tinh hoa Thủ công Mỹ nghệ & Nghệ nhân Làng nghề Việt',
        featuredProducts,
        featuredWorkshops,
        categories,
        latestNews
      });
    } catch (err) {
      next(err);
    }
  },

  /** Hiển thị bộ sưu tập công khai với bộ lọc sản phẩm. */
  catalog(req, res, next) {
    try {
      const { category, workshop, q, sort } = req.query;

      const products = Product.findPublished({
        category: category || '',
        workshopSlug: workshop || '',
        q: q || '',
        sort: sort || 'newest',
        limit: 48
      });

      const totalCount = Product.countPublished({
        category: category || '',
        workshopSlug: workshop || '',
        q: q || ''
      });

      const categories = Product.findDistinctCategories();
      const workshops = Artisan.findAllApproved({ limit: 100 });

      res.render('catalog/index', {
        title: 'Bộ sưu tập Tác phẩm Thủ công - vCraft',
        products,
        totalCount,
        categories,
        workshops,
        selectedCategory: category || '',
        selectedWorkshop: workshop || '',
        searchQuery: q || '',
        selectedSort: sort || 'newest'
      });
    } catch (err) {
      next(err);
    }
  },

  /** Hiển thị danh sách xưởng công khai. */
  workshops(req, res, next) {
    try {
      const { category, q } = req.query;

      const workshops = Artisan.findAllApproved({
        category: category || '',
        q: q || '',
        limit: 60
      });

      const categories = Artisan.getAllCategories();

      res.render('workshops/index', {
        title: 'Xưởng Thủ công & Nghệ nhân Làng nghề - vCraft',
        workshops,
        categories,
        selectedCategory: category || '',
        searchQuery: q || ''
      });
    } catch (err) {
      next(err);
    }
  },

  /** Hiển thị xưởng đã duyệt. */
  workshopDetail(req, res, next) {
    try {
      const { slug } = req.params;
      const workshop = Artisan.findApprovedBySlug(slug);

      if (!workshop) {
        const err = new Error('Không tìm thấy thông tin xưởng thủ công hoặc xưởng chưa được phê duyệt.');
        err.status = 404;
        return next(err);
      }

      const products = Product.findByWorkshopSlug(slug, 24);

      res.render('workshops/show', {
        title: `${workshop.workshop_name} - Nghệ nhân vCraft`,
        workshop,
        products
      });
    } catch (err) {
      next(err);
    }
  },

  /** Hiển thị bản đồ xưởng đã duyệt. */
  mapView(req, res, next) {
    try {
      const workshops = Artisan.findForMap();
      const categories = Artisan.getAllCategories();

      res.render('map', {
        title: 'Bản đồ Làng nghề & Xưởng Thủ công - vCraft',
        workshops,
        categories
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = publicController;
