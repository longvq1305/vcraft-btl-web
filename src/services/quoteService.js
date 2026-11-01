const Quote = require('../models/Quote');
const Bid = require('../models/Bid');

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

// Domain Errors
class QuoteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'QuoteError';
    this.statusCode = statusCode;
  }
}

class NotFoundError extends QuoteError {
  constructor(message = 'Không tìm thấy yêu cầu báo giá') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ForbiddenError extends QuoteError {
  constructor(message = 'Bạn không có quyền thực hiện thao tác này') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends QuoteError {
  constructor(message = 'Dữ liệu đã thay đổi hoặc trạng thái không hợp lệ. Vui lòng tải lại trang.') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class ValidationError extends QuoteError {
  constructor(message = 'Dữ liệu không hợp lệ') {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

const quoteService = {
  QuoteError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,

  /**
   * Create a new quote request as Draft
   */
  createQuote({ buyerId, title, description, category, quantity, deadline }, customDb = null) {
    const db = getDb(customDb);

    if (!buyerId) {
      throw new ForbiddenError('Yêu cầu đăng nhập tài khoản khách mua để tạo báo giá');
    }

    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle || trimmedTitle.length < 3 || trimmedTitle.length > 200) {
      throw new ValidationError('Tiêu đề yêu cầu bắt buộc và phải từ 3 đến 200 ký tự');
    }

    const trimmedDesc = (description || '').trim();
    if (!trimmedDesc || trimmedDesc.length < 5) {
      throw new ValidationError('Mô tả chi tiết yêu cầu bắt buộc và phải từ 5 ký tự trở lên');
    }

    const trimmedCategory = (category || '').trim();
    if (!trimmedCategory) {
      throw new ValidationError('Vui lòng chọn danh mục sản phẩm');
    }

    const numQty = Number(quantity);
    if (!Number.isInteger(numQty) || numQty <= 0) {
      throw new ValidationError('Số lượng sản phẩm phải là số nguyên dương lớn hơn 0');
    }

    const trimmedDeadline = (deadline || '').trim();
    if (!trimmedDeadline || isNaN(Date.parse(trimmedDeadline))) {
      throw new ValidationError('Hạn chót báo giá không hợp lệ');
    }

    // Ensure deadline is not in the past (compare YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);
    if (trimmedDeadline < today) {
      throw new ValidationError('Hạn chót báo giá không được ở quá khứ');
    }

    const quoteId = Quote.create({
      buyerId,
      title: trimmedTitle,
      description: trimmedDesc,
      category: trimmedCategory,
      quantity: numQty,
      deadline: trimmedDeadline
    }, db);

    return Quote.findById(quoteId, db);
  },

  /**
   * Send a draft quote request to matching approved artisans
   * Transitions: draft -> sent
   */
  sendQuote({ quoteId, buyerId }, customDb = null) {
    const db = getDb(customDb);

    const initial = Quote.findById(quoteId, db);
    if (!initial) {
      throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
    }

    if (initial.buyer_id !== buyerId) {
      throw new ForbiddenError('Bạn không có quyền gửi yêu cầu báo giá này');
    }

    if (initial.status !== 'draft') {
      throw new ConflictError(`Yêu cầu báo giá đã được gửi hoặc không ở trạng thái nháp (trạng thái: ${initial.status})`);
    }

    // Find targeted approved artisans
    const targetArtisanIds = Quote.findApprovedArtisansForCategory(initial.category, db);
    if (!targetArtisanIds || targetArtisanIds.length === 0) {
      throw new ValidationError('Hiện chưa có nghệ nhân nào được duyệt trong hệ thống để tiếp nhận yêu cầu báo giá');
    }

    // Execute atomically
    const tx = db.transaction(() => {
      const current = Quote.findById(quoteId, db);
      if (!current || current.buyer_id !== buyerId) {
        throw new ForbiddenError('Quyền truy cập bị từ chối');
      }
      if (current.status !== 'draft') {
        throw new ConflictError(`Không thể gửi: trạng thái hiện tại là ${current.status}`);
      }

      // Populate quote_targets
      Quote.insertTargets(quoteId, targetArtisanIds, db);

      // Transition draft -> sent
      const changes = Quote.updateStatus(quoteId, 'sent', current.version, null, db);
      if (changes === 0) {
        throw new ConflictError('Xung đột dữ liệu khi gửi yêu cầu báo giá. Vui lòng tải lại trang.');
      }
    });

    tx.immediate();

    return Quote.findById(quoteId, db);
  },

  /**
   * Submit or update an artisan's bid on a sent/bidding quote
   * Transitions: sent -> bidding (on first bid) or remains bidding
   */
  submitOrUpdateBid({ quoteId, artisanId, unitPrice, leadDays, completionDate, note }, customDb = null) {
    const db = getDb(customDb);

    // Verify artisan is approved
    const artisanUser = db.prepare('SELECT id, role, status FROM users WHERE id = ?').get(artisanId);
    if (!artisanUser || artisanUser.role !== 'artisan' || artisanUser.status !== 'approved') {
      throw new ForbiddenError('Chỉ nghệ nhân đã được phê duyệt mới có thể chào giá');
    }

    // Verify artisan is targeted
    if (!Quote.isArtisanTargeted(quoteId, artisanId, db)) {
      throw new ForbiddenError('Bạn không thuộc danh sách nghệ nhân được mời chào giá cho yêu cầu này');
    }

    // Validate bid fields
    const numPrice = Number(unitPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      throw new ValidationError('Đơn giá chào phải là số dương lớn hơn 0');
    }

    const numDays = Number(leadDays);
    if (!Number.isInteger(numDays) || numDays <= 0) {
      throw new ValidationError('Thời gian sản xuất (ngày) phải là số nguyên dương');
    }

    const trimmedDate = (completionDate || '').trim();
    if (!trimmedDate || isNaN(Date.parse(trimmedDate))) {
      throw new ValidationError('Ngày hoàn thành dự kiến không hợp lệ');
    }

    const today = new Date().toISOString().slice(0, 10);
    if (trimmedDate < today) {
      throw new ValidationError('Ngày hoàn thành dự kiến không được ở quá khứ');
    }

    const trimmedNote = (note || '').trim();

    // Atomic transaction
    const tx = db.transaction(() => {
      const current = Quote.findById(quoteId, db);
      if (!current) {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }

      if (current.status !== 'sent' && current.status !== 'bidding') {
        throw new ConflictError(`Không thể chào giá do yêu cầu đang ở trạng thái "${current.status}"`);
      }

      // Upsert bid
      const bid = Bid.upsert({
        quoteId,
        artisanId,
        unitPrice: numPrice,
        leadDays: numDays,
        completionDate: trimmedDate,
        note: trimmedNote
      }, db);

      // If status was 'sent', first bid atomically moves it to 'bidding'
      if (current.status === 'sent') {
        const changes = Quote.updateStatus(quoteId, 'bidding', current.version, null, db);
        if (changes === 0) {
          throw new ConflictError('Xung đột trạng thái khi cập nhật yêu cầu báo giá');
        }
      }

      return bid;
    });

    return tx.immediate();
  },

  /**
   * Buyer accepts an artisan's bid with optimistic version locking
   * Transitions: sent/bidding -> accepted
   */
  acceptBid({ quoteId, buyerId, bidId, version }, customDb = null) {
    const db = getDb(customDb);

    if (version === undefined || version === null || isNaN(Number(version))) {
      throw new ValidationError('Thiếu thông tin phiên bản kiểm soát xung đột (version)');
    }
    const expectedVersion = Number(version);

    // Initial checks
    const quote = Quote.findById(quoteId, db);
    if (!quote) {
      throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
    }

    if (quote.buyer_id !== buyerId) {
      throw new ForbiddenError('Bạn không có quyền chấp thuận báo giá của yêu cầu này');
    }

    if (quote.status !== 'sent' && quote.status !== 'bidding') {
      throw new ConflictError(`Yêu cầu báo giá không ở trạng thái có thể chấp thuận (trạng thái: ${quote.status})`);
    }

    const bid = Bid.findById(bidId, db);
    if (!bid || bid.quote_id !== Number(quoteId)) {
      throw new ValidationError('Báo giá không tồn tại hoặc không thuộc về yêu cầu này');
    }

    if (bid.status !== 'submitted') {
      throw new ConflictError('Báo giá này không ở trạng thái hợp lệ để chấp thuận');
    }

    // Atomic acceptance transaction
    const tx = db.transaction(() => {
      const current = Quote.findById(quoteId, db);
      if (!current) {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }

      if (current.buyer_id !== buyerId) {
        throw new ForbiddenError('Quyền truy cập bị từ chối');
      }

      if (current.status !== 'sent' && current.status !== 'bidding') {
        throw new ConflictError('Yêu cầu báo giá đã được xử lý hoặc đã chốt ở phiên khác');
      }

      if (Number(current.version) !== expectedVersion) {
        throw new ConflictError('Dữ liệu yêu cầu báo giá đã thay đổi bởi phiên làm việc khác. Vui lòng tải lại trang.');
      }

      const freshBid = Bid.findById(bidId, db);
      if (!freshBid || freshBid.quote_id !== Number(quoteId) || freshBid.status !== 'submitted') {
        throw new ConflictError('Báo giá được chọn không còn khả dụng để chấp thuận');
      }

      // Update quote_requests with optimistic locking
      const updateStmt = db.prepare(`
        UPDATE quote_requests
        SET status = 'accepted',
            accepted_bid_id = ?,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND version = ? AND status IN ('sent', 'bidding')
      `);
      const info = updateStmt.run(bidId, quoteId, expectedVersion);

      if (info.changes === 0) {
        throw new ConflictError('Xung đột khi chấp thuận báo giá. Giao dịch khác đã hoàn tất trước đó.');
      }

      // Mark chosen bid as accepted
      Bid.acceptBid(bidId, db);

      // Mark all other submitted bids as rejected
      Bid.rejectOtherBids(quoteId, bidId, db);
    });

    tx.immediate();

    return Quote.findById(quoteId, db);
  },

  /**
   * Accepted artisan starts production
   * Transitions: accepted -> in_production
   */
  startProduction({ quoteId, artisanId }, customDb = null) {
    const db = getDb(customDb);

    const quote = Quote.findById(quoteId, db);
    if (!quote) {
      throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
    }

    if (quote.accepted_artisan_id !== artisanId) {
      throw new ForbiddenError('Chỉ nghệ nhân được chấp thuận đơn hàng mới có thể bắt đầu sản xuất');
    }

    if (quote.status !== 'accepted') {
      throw new ConflictError(`Không thể bắt đầu sản xuất từ trạng thái "${quote.status}". Yêu cầu phải ở trạng thái "accepted".`);
    }

    const tx = db.transaction(() => {
      const current = Quote.findById(quoteId, db);
      if (current.accepted_artisan_id !== artisanId) {
        throw new ForbiddenError('Quyền truy cập bị từ chối');
      }
      if (current.status !== 'accepted') {
        throw new ConflictError(`Trạng thái yêu cầu báo giá đã thay đổi: ${current.status}`);
      }

      const stmt = db.prepare(`
        UPDATE quote_requests
        SET status = 'in_production',
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'accepted'
      `);
      const info = stmt.run(quoteId);
      if (info.changes === 0) {
        throw new ConflictError('Không thể cập nhật trạng thái sang Đang sản xuất');
      }
    });

    tx.immediate();

    return Quote.findById(quoteId, db);
  },

  /**
   * Accepted artisan marks production as delivered
   * Transitions: in_production -> delivered
   */
  deliverQuote({ quoteId, artisanId }, customDb = null) {
    const db = getDb(customDb);

    const quote = Quote.findById(quoteId, db);
    if (!quote) {
      throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
    }

    if (quote.accepted_artisan_id !== artisanId) {
      throw new ForbiddenError('Chỉ nghệ nhân được chấp thuận đơn hàng mới có thể giao hàng');
    }

    if (quote.status !== 'in_production') {
      throw new ConflictError(`Không thể đánh dấu giao hàng từ trạng thái "${quote.status}". Yêu cầu phải ở trạng thái "in_production".`);
    }

    const tx = db.transaction(() => {
      const current = Quote.findById(quoteId, db);
      if (current.accepted_artisan_id !== artisanId) {
        throw new ForbiddenError('Quyền truy cập bị từ chối');
      }
      if (current.status !== 'in_production') {
        throw new ConflictError(`Trạng thái yêu cầu báo giá đã thay đổi: ${current.status}`);
      }

      const stmt = db.prepare(`
        UPDATE quote_requests
        SET status = 'delivered',
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'in_production'
      `);
      const info = stmt.run(quoteId);
      if (info.changes === 0) {
        throw new ConflictError('Không thể cập nhật trạng thái sang Đã giao hàng');
      }
    });

    tx.immediate();

    return Quote.findById(quoteId, db);
  },

  /**
   * Retrieve quote detail with role-specific views and data filtering
   */
  getQuoteDetailForUser(quoteId, user, customDb = null) {
    const db = getDb(customDb);

    if (!user) {
      throw new ForbiddenError('Vui lòng đăng nhập để xem thông tin báo giá');
    }

    const quote = Quote.findById(quoteId, db);
    if (!quote) {
      throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
    }

    if (user.role === 'buyer') {
      // Buyer can only view their own quotes
      if (quote.buyer_id !== user.id) {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }

      const bids = Bid.findByQuoteId(quoteId, db);
      const targets = Quote.getTargets(quoteId, db);

      return {
        quote,
        bids,
        targets,
        isOwner: true,
        isArtisan: false,
        isAdmin: false
      };
    }

    if (user.role === 'artisan') {
      // Artisans cannot view draft requests
      if (quote.status === 'draft') {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }

      // Artisan must be targeted
      if (!Quote.isArtisanTargeted(quoteId, user.id, db)) {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }

      // Mark as seen
      Quote.markSeen(quoteId, user.id, db);

      // Get artisan's own bid
      const myBid = Bid.findByQuoteAndArtisan(quoteId, user.id, db);
      const allBids = Bid.findByQuoteId(quoteId, db);
      const isWinner = quote.accepted_artisan_id === user.id;

      return {
        quote,
        myBid,
        totalBidsCount: allBids.length,
        isWinner,
        isOwner: false,
        isArtisan: true,
        isAdmin: false
      };
    }

    if (user.role === 'admin') {
      // Admin has read-only oversight
      const bids = Bid.findByQuoteId(quoteId, db);
      const targets = Quote.getTargets(quoteId, db);

      return {
        quote,
        bids,
        targets,
        isOwner: false,
        isArtisan: false,
        isAdmin: true
      };
    }

    throw new ForbiddenError('Quyền truy cập không hợp lệ');
  },

  /**
   * List quotes for current user by role
   */
  listQuotesForUser(user, customDb = null) {
    const db = getDb(customDb);

    if (!user) {
      throw new ForbiddenError('Vui lòng đăng nhập');
    }

    if (user.role === 'buyer') {
      return Quote.findByBuyerId(user.id, db);
    }

    if (user.role === 'artisan') {
      return Quote.findByArtisanId(user.id, db);
    }

    if (user.role === 'admin') {
      return Quote.findAll(db);
    }

    return [];
  }
};

module.exports = quoteService;
