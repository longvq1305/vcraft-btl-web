const BaseModel = require('./BaseModel');

const BID_WITH_ARTISAN = `
  SELECT b.*,
         u.full_name AS artisan_name,
         u.email AS artisan_email,
         ap.workshop_name,
         ap.slug AS artisan_slug,
         ap.phone AS artisan_phone
  FROM bids b
  JOIN users u ON u.id = b.artisan_id
  LEFT JOIN artisan_profiles ap ON ap.user_id = b.artisan_id
`;

/**
 * Model báo giá của nghệ nhân (bảng bids). Mỗi nghệ nhân có tối đa một báo giá cho mỗi yêu cầu.
 */
class BidModel extends BaseModel {
  static tableName = 'bids';

  /**
   * @param {number|string} quoteId
   * @returns {Object[]}
   */
  findByQuoteId(quoteId) {
    return this.db.all(`${BID_WITH_ARTISAN} WHERE b.quote_id = ? ORDER BY b.created_at ASC`, [quoteId]);
  }

  /**
   * @param {number|string} quoteId
   * @param {number} artisanId
   * @returns {Object|undefined}
   */
  findByQuoteAndArtisan(quoteId, artisanId) {
    return this.db.get(`${BID_WITH_ARTISAN} WHERE b.quote_id = ? AND b.artisan_id = ?`, [quoteId, artisanId]);
  }

  /**
   * @param {number|string} id
   * @returns {Object|undefined}
   */
  findById(id) {
    return this.db.get(`${BID_WITH_ARTISAN} WHERE b.id = ?`, [id]);
  }

  /**
   * Gửi mới hoặc cập nhật báo giá của nghệ nhân; trạng thái trở về 'submitted'.
   * @param {{ quoteId: number|string, artisanId: number, unitPrice: number, leadDays: number, completionDate: string, note?: string }} data
   * @returns {Object} Báo giá sau khi ghi.
   */
  upsert({ quoteId, artisanId, unitPrice, leadDays, completionDate, note }) {
    const now = this.db.now();
    this.db.upsert('bids', {
      quote_id: quoteId,
      artisan_id: artisanId,
      unit_price: unitPrice,
      lead_days: leadDays,
      completion_date: completionDate,
      note: note || null,
      status: 'submitted',
      created_at: now,
      updated_at: now
    }, ['quote_id', 'artisan_id'], {
      unit_price: this.db.excluded('unit_price'),
      lead_days: this.db.excluded('lead_days'),
      completion_date: this.db.excluded('completion_date'),
      note: this.db.excluded('note'),
      status: 'submitted',
      updated_at: now
    });
    return this.findByQuoteAndArtisan(quoteId, artisanId);
  }

  /**
   * @param {number} id
   * @returns {number} Số dòng thay đổi.
   */
  acceptBid(id) {
    return this.updateById(id, { status: 'accepted', updated_at: this.db.now() });
  }

  /**
   * Từ chối mọi báo giá đang chờ của yêu cầu, trừ báo giá được chốt.
   * @param {number|string} quoteId
   * @param {number} acceptedBidId
   * @returns {number} Số dòng thay đổi.
   */
  rejectOtherBids(quoteId, acceptedBidId) {
    return this.db.run(`
      UPDATE bids
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE quote_id = ? AND id != ? AND status = 'submitted'
    `, [quoteId, acceptedBidId]).changes;
  }
}

module.exports = new BidModel();
module.exports.BidModel = BidModel;
