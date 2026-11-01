const { db: defaultDb } = (() => {
  try {
    return require('../config/database');
  } catch (err) {
    return { db: null };
  }
})();

function getDb(customDb) {
  if (customDb) return customDb;
  if (defaultDb) return defaultDb;
  return require('../config/database').db;
}

const Bid = {
  /**
   * Find all bids for a quote
   */
  findByQuoteId(quoteId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      SELECT b.*,
             u.full_name AS artisan_name,
             u.email AS artisan_email,
             ap.workshop_name,
             ap.slug AS artisan_slug,
             ap.phone AS artisan_phone
      FROM bids b
      JOIN users u ON u.id = b.artisan_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = b.artisan_id
      WHERE b.quote_id = ?
      ORDER BY b.created_at ASC
    `);
    return stmt.all(quoteId);
  },

  /**
   * Find an artisan's bid for a specific quote
   */
  findByQuoteAndArtisan(quoteId, artisanId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      SELECT b.*,
             u.full_name AS artisan_name,
             u.email AS artisan_email,
             ap.workshop_name,
             ap.slug AS artisan_slug,
             ap.phone AS artisan_phone
      FROM bids b
      JOIN users u ON u.id = b.artisan_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = b.artisan_id
      WHERE b.quote_id = ? AND b.artisan_id = ?
    `);
    return stmt.get(quoteId, artisanId);
  },

  /**
   * Find bid by ID
   */
  findById(id, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      SELECT b.*,
             u.full_name AS artisan_name,
             u.email AS artisan_email,
             ap.workshop_name,
             ap.slug AS artisan_slug,
             ap.phone AS artisan_phone
      FROM bids b
      JOIN users u ON u.id = b.artisan_id
      LEFT JOIN artisan_profiles ap ON ap.user_id = b.artisan_id
      WHERE b.id = ?
    `);
    return stmt.get(id);
  },

  /**
   * Insert or update bid from an artisan on a quote
   */
  upsert({ quoteId, artisanId, unitPrice, leadDays, completionDate, note }, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      INSERT INTO bids (
        quote_id, artisan_id, unit_price, lead_days, completion_date, note,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'submitted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(quote_id, artisan_id) DO UPDATE SET
        unit_price = excluded.unit_price,
        lead_days = excluded.lead_days,
        completion_date = excluded.completion_date,
        note = excluded.note,
        status = 'submitted',
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(quoteId, artisanId, unitPrice, leadDays, completionDate, note || null);
    
    // Retrieve the active bid
    return this.findByQuoteAndArtisan(quoteId, artisanId, db);
  },

  /**
   * Set status to accepted
   */
  acceptBid(id, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      UPDATE bids
      SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  /**
   * Reject all other submitted bids for this quote
   */
  rejectOtherBids(quoteId, acceptedBidId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      UPDATE bids
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE quote_id = ? AND id != ? AND status = 'submitted'
    `);
    return stmt.run(quoteId, acceptedBidId);
  }
};

module.exports = Bid;
