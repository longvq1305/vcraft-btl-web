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

const Quote = {
  /**
   * Create a new quote request in 'draft' status
   */
  create({ buyerId, title, description, category, quantity, deadline }, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      INSERT INTO quote_requests (
        buyer_id, title, description, category, quantity, deadline,
        status, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const info = stmt.run(buyerId, title, description, category, quantity, deadline);
    return info.lastInsertRowid;
  },

  /**
   * Find a quote request by ID with buyer details and accepted bid details
   */
  findById(id, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
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
    `);
    return stmt.get(id);
  },

  /**
   * Find quotes created by a buyer
   */
  findByBuyerId(buyerId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
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
    `);
    return stmt.all(buyerId);
  },

  /**
   * Find targeted quotes for an artisan (excluding drafts)
   */
  findByArtisanId(artisanId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
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
    `);
    return stmt.all(artisanId, artisanId);
  },

  /**
   * Find all quotes (for admin overview)
   */
  findAll(customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
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
    `);
    return stmt.all();
  },

  /**
   * Check if an artisan is targeted for a quote
   */
  isArtisanTargeted(quoteId, artisanId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      SELECT 1 FROM quote_targets WHERE quote_id = ? AND artisan_id = ?
    `);
    return !!stmt.get(quoteId, artisanId);
  },

  /**
   * Mark quote target as seen by artisan
   */
  markSeen(quoteId, artisanId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      UPDATE quote_targets
      SET seen_at = CURRENT_TIMESTAMP
      WHERE quote_id = ? AND artisan_id = ? AND seen_at IS NULL
    `);
    return stmt.run(quoteId, artisanId);
  },

  /**
   * Get list of targeted artisans for a quote
   */
  getTargets(quoteId, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
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
    `);
    return stmt.all(quoteId);
  },

  /**
   * Find approved artisans matching a category:
   * 1. Category in profile's comma-separated categories OR published product category matches.
   * 2. If none match, target all approved artisans.
   */
  findApprovedArtisansForCategory(category, customDb = null) {
    const db = getDb(customDb);
    const trimmed = (category || '').trim();

    // First attempt: match category in artisan profile or published product
    const matchStmt = db.prepare(`
      SELECT DISTINCT u.id
      FROM users u
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      LEFT JOIN products p ON p.artisan_id = u.id AND p.status = 'published' AND LOWER(TRIM(p.category)) = LOWER(?)
      WHERE u.role = 'artisan' AND u.status = 'approved'
        AND (
          p.id IS NOT NULL
          OR (ap.categories IS NOT NULL AND LOWER(ap.categories) LIKE '%' || LOWER(?) || '%')
        )
    `);
    const matched = matchStmt.all(trimmed, trimmed);

    if (matched && matched.length > 0) {
      return matched.map(r => r.id);
    }

    // Fallback: target all approved artisans
    const allApprovedStmt = db.prepare(`
      SELECT u.id
      FROM users u
      WHERE u.role = 'artisan' AND u.status = 'approved'
    `);
    const allApproved = allApprovedStmt.all();
    return (allApproved || []).map(r => r.id);
  },

  /**
   * Insert targets for a quote
   */
  insertTargets(quoteId, artisanIds, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO quote_targets (quote_id, artisan_id)
      VALUES (?, ?)
    `);
    for (const artisanId of artisanIds) {
      stmt.run(quoteId, artisanId);
    }
  },

  /**
   * Update status with optimistic version check
   */
  updateStatus(quoteId, newStatus, currentVersion, acceptedBidId = null, customDb = null) {
    const db = getDb(customDb);
    const stmt = db.prepare(`
      UPDATE quote_requests
      SET status = ?,
          accepted_bid_id = COALESCE(?, accepted_bid_id),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `);
    const info = stmt.run(newStatus, acceptedBidId, quoteId, currentVersion);
    return info.changes;
  }
};

module.exports = Quote;
