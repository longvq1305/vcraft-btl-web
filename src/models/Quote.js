const BaseModel = require('./BaseModel');

/**
 * Model yêu cầu báo giá (quote_requests) và danh sách nghệ nhân được mời (quote_targets).
 * Chỉ chứa truy vấn; luật chuyển trạng thái nằm ở quoteService.
 */
class QuoteModel extends BaseModel {
  static tableName = 'quote_requests';

  /**
   * Tạo yêu cầu ở trạng thái nháp.
   * @param {{ buyerId: number, title: string, description: string, category: string, quantity: number, deadline: string }} data
   * @returns {number} id yêu cầu.
   */
  createDraft({ buyerId, title, description, category, quantity, deadline }) {
    return this.create({
      buyer_id: buyerId,
      title,
      description,
      category,
      quantity,
      deadline,
      status: 'draft',
      version: 0,
      created_at: this.db.now(),
      updated_at: this.db.now()
    });
  }

  /**
   * Sửa các trường của bản nháp nếu chủ sở hữu, trạng thái và phiên bản còn khớp.
   * @param {number|string} id
   * @param {number} buyerId
   * @param {number} version
   * @param {{title: string, description: string, category: string, quantity: number, deadline: string}} fields
   * @returns {number} Số dòng thay đổi.
   */
  updateDraft(id, buyerId, version, fields) {
    return this.db.update(this.table, {
      ...fields,
      version: version + 1,
      updated_at: this.db.now()
    }, { id, buyer_id: buyerId, status: 'draft', version });
  }

  /**
   * Xóa bản nháp nếu chủ sở hữu, trạng thái và phiên bản còn khớp.
   * @param {number|string} id
   * @param {number} buyerId
   * @param {number} version
   * @returns {number} Số dòng bị xóa.
   */
  deleteDraft(id, buyerId, version) {
    return this.db.delete(this.table, { id, buyer_id: buyerId, status: 'draft', version });
  }

  /**
   * Yêu cầu kèm thông tin người mua và báo giá đã chốt.
   * @param {number|string} id
   * @returns {Object|undefined}
   */
  findById(id) {
    return this.db.get(`
      SELECT qr.*,
             u.full_name AS buyer_name,
             u.email AS buyer_email,
             ap.workshop_name AS accepted_workshop_name,
             ap.slug AS accepted_artisan_slug,
             b_acc.unit_price AS accepted_unit_price,
             b_acc.lead_days AS accepted_lead_days,
             b_acc.completion_date AS accepted_completion_date,
             b_acc.artisan_id AS accepted_artisan_id
      FROM quote_requests qr
      JOIN users u ON u.id = qr.buyer_id
      LEFT JOIN bids b_acc ON b_acc.id = qr.accepted_bid_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = b_acc.artisan_id
      WHERE qr.id = ?
    `, [id]);
  }

  /**
   * @param {number} buyerId
   * @returns {Object[]}
   */
  findByBuyerId(buyerId) {
    return this.db.all(`
      SELECT qr.*,
             (SELECT COUNT(*) FROM quote_targets qt WHERE qt.quote_id = qr.id) AS target_count,
             (SELECT COUNT(*) FROM bids b WHERE b.quote_id = qr.id) AS bid_count,
             b_acc.unit_price AS accepted_unit_price,
             ap.workshop_name AS accepted_workshop_name
      FROM quote_requests qr
      LEFT JOIN bids b_acc ON b_acc.id = qr.accepted_bid_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = b_acc.artisan_id
      WHERE qr.buyer_id = ?
      ORDER BY qr.created_at DESC
    `, [buyerId]);
  }

  /**
   * Yêu cầu mà nghệ nhân được mời (không gồm bản nháp).
   * @param {number} artisanId
   * @returns {Object[]}
   */
  findByArtisanId(artisanId) {
    return this.db.all(`
      SELECT qr.*,
             u.full_name AS buyer_name,
             b_art.id AS my_bid_id,
             b_art.unit_price AS my_bid_unit_price,
             b_art.lead_days AS my_bid_lead_days,
             b_art.completion_date AS my_bid_completion_date,
             b_art.status AS my_bid_status,
             b_art.note AS my_bid_note,
             (SELECT COUNT(*) FROM bids b WHERE b.quote_id = qr.id) AS total_bid_count,
             CASE WHEN qr.accepted_bid_id = b_art.id THEN 1 ELSE 0 END AS is_winner,
             qt.seen_at
      FROM quote_requests qr
      INNER JOIN quote_targets qt ON qt.quote_id = qr.id AND qt.artisan_id = ?
      INNER JOIN users u ON u.id = qr.buyer_id
      LEFT JOIN bids b_art ON b_art.quote_id = qr.id AND b_art.artisan_id = ?
      WHERE qr.status != 'draft'
      ORDER BY qr.created_at DESC
    `, [artisanId, artisanId]);
  }

  /**
   * Toàn bộ yêu cầu (admin giám sát).
   * @param {{ limit?: number }} [options]
   * @returns {Object[]}
   */
  findAllWithStats({ limit } = {}) {
    const params = [];
    let sql = `
      SELECT qr.*,
             u.full_name AS buyer_name,
             u.email AS buyer_email,
             (SELECT COUNT(*) FROM quote_targets qt WHERE qt.quote_id = qr.id) AS target_count,
             (SELECT COUNT(*) FROM bids b WHERE b.quote_id = qr.id) AS bid_count,
             ap.workshop_name AS accepted_workshop_name
      FROM quote_requests qr
      JOIN users u ON u.id = qr.buyer_id
      LEFT JOIN bids b_acc ON b_acc.id = qr.accepted_bid_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = b_acc.artisan_id
      ORDER BY qr.created_at DESC
    `;
    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    return this.db.all(sql, params);
  }

  /**
   * Thống kê số yêu cầu theo nhóm trạng thái cho bảng điều khiển admin.
   * @returns {{ total: number, bidding: number, accepted: number, delivered: number }}
   */
  countStats() {
    const row = this.db.get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('sent', 'bidding') THEN 1 ELSE 0 END) AS bidding,
        SUM(CASE WHEN status IN ('accepted', 'in_production') THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
      FROM quote_requests
    `);
    return {
      total: row.total || 0,
      bidding: row.bidding || 0,
      accepted: row.accepted || 0,
      delivered: row.delivered || 0
    };
  }

  /**
   * @param {number|string} quoteId
   * @param {number} artisanId
   * @returns {boolean}
   */
  isArtisanTargeted(quoteId, artisanId) {
    return Boolean(this.db.get('SELECT 1 AS found FROM quote_targets WHERE quote_id = ? AND artisan_id = ?', [quoteId, artisanId]));
  }

  /**
   * Ghi nhận lần đầu nghệ nhân mở yêu cầu.
   * @param {number|string} quoteId
   * @param {number} artisanId
   */
  markSeen(quoteId, artisanId) {
    this.db.update('quote_targets', { seen_at: this.db.now() }, { quote_id: quoteId, artisan_id: artisanId, seen_at: null });
  }

  /**
   * @param {number|string} quoteId
   * @returns {Object[]}
   */
  getTargets(quoteId) {
    return this.db.all(`
      SELECT qt.artisan_id,
             qt.seen_at,
             u.full_name AS artisan_name,
             u.email AS artisan_email,
             ap.workshop_name,
             ap.slug AS artisan_slug,
             ap.phone AS artisan_phone
      FROM quote_targets qt
      JOIN users u ON u.id = qt.artisan_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = qt.artisan_id
      WHERE qt.quote_id = ?
      ORDER BY u.full_name ASC
    `, [quoteId]);
  }

  /**
   * Nghệ nhân đã duyệt phù hợp danh mục: khớp danh mục hồ sơ xưởng hoặc có sản phẩm
   * đã đăng cùng danh mục. Không ai khớp thì mời toàn bộ nghệ nhân đã duyệt.
   * @param {string} category
   * @returns {number[]}
   */
  findApprovedArtisansForCategory(category) {
    const trimmed = (category || '').trim();
    const matched = this.db.all(`
      SELECT DISTINCT u.id
      FROM users u
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      LEFT JOIN products p ON p.artisan_id = u.id AND p.status = 'published' AND LOWER(TRIM(p.category)) = LOWER(?)
      WHERE u.role = 'artisan' AND u.status = 'approved'
        AND (
          p.id IS NOT NULL
          OR (ap.categories IS NOT NULL AND LOWER(ap.categories) LIKE '%' || LOWER(?) || '%')
        )
    `, [trimmed, trimmed]);

    if (matched.length > 0) {
      return matched.map((r) => r.id);
    }

    return this.db.all("SELECT id FROM users WHERE role = 'artisan' AND status = 'approved'").map((r) => r.id);
  }

  /**
   * Thêm nghệ nhân vào danh sách được mời (bỏ qua nếu đã có).
   * @param {number|string} quoteId
   * @param {number[]} artisanIds
   */
  insertTargets(quoteId, artisanIds) {
    for (const artisanId of artisanIds) {
      this.db.insertIgnore('quote_targets', { quote_id: quoteId, artisan_id: artisanId });
    }
  }

  /**
   * Chuyển trạng thái có điều kiện, tăng version (khóa lạc quan).
   * @param {number|string} quoteId
   * @param {{ from: string[], to: string, expectedVersion?: number, acceptedBidId?: number }} transition
   * @returns {number} Số dòng thay đổi (0 nghĩa là trạng thái/version đã đổi ở phiên khác).
   */
  transitionStatus(quoteId, { from, to, expectedVersion, acceptedBidId }) {
    const params = [to];
    let sql = 'UPDATE quote_requests SET status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP';
    if (acceptedBidId !== undefined) {
      sql += ', accepted_bid_id = ?';
      params.push(acceptedBidId);
    }
    sql += ` WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`;
    params.push(quoteId, ...from);
    if (expectedVersion !== undefined) {
      sql += ' AND version = ?';
      params.push(expectedVersion);
    }
    return this.db.run(sql, params).changes;
  }
}

module.exports = new QuoteModel();
module.exports.QuoteModel = QuoteModel;
