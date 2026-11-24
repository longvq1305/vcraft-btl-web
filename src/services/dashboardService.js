const User = require('../models/User');
const Quote = require('../models/Quote');
const News = require('../models/News');

/**
 * Tổng hợp số liệu cho bàn làm việc quản trị. Gom các truy vấn thống kê khỏi controller.
 */
class DashboardService {
  /**
   * @param {import('../db/DatabaseAdapter')} [adapter]
   */
  constructor(adapter) {
    this.users = adapter ? User.withAdapter(adapter) : User;
    this.quotes = adapter ? Quote.withAdapter(adapter) : Quote;
    this.db = this.users.db;
  }

  /**
   * Thống kê tổng hợp người dùng, sản phẩm, yêu cầu báo giá, bản tin.
   * @returns {Object}
   */
  getStats() {
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
      newsTotal: News.countAll(),
      newsPublished: News.countPublished()
    };

    const artisanKeys = { pending: 'artisansPending', approved: 'artisansApproved', suspended: 'artisansSuspended' };
    for (const row of this.users.countByRoleAndStatus()) {
      stats.totalUsers += row.count;
      if (row.role === 'buyer') {
        stats.buyers += row.count;
      } else if (row.role === 'artisan' && artisanKeys[row.status]) {
        stats[artisanKeys[row.status]] += row.count;
      }
    }

    const products = this.db.get(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
      FROM products
    `);
    stats.productsTotal = products.total || 0;
    stats.productsPublished = products.published || 0;

    const quotes = this.quotes.countStats();
    stats.quotesTotal = quotes.total;
    stats.quotesBidding = quotes.bidding;
    stats.quotesAccepted = quotes.accepted;
    stats.quotesDelivered = quotes.delivered;

    return stats;
  }

  /**
   * Sản phẩm mới nhất kèm tên nghệ nhân/xưởng.
   * @param {number} [limit=10]
   * @returns {Object[]}
   */
  getRecentProducts(limit = 10) {
    return this.db.all(`
      SELECT p.id, p.name, p.slug, p.category, p.price, p.inventory, p.status, p.created_at,
             u.full_name AS artisan_name, ap.workshop_name
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Yêu cầu báo giá mới nhất.
   * @param {number} [limit=10]
   * @returns {Object[]}
   */
  getRecentQuotes(limit = 10) {
    return this.quotes.findAllWithStats({ limit });
  }
}

module.exports = new DashboardService();
module.exports.DashboardService = DashboardService;
