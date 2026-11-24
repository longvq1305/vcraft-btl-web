const Quote = require('../models/Quote');
const Bid = require('../models/Bid');
const User = require('../models/User');
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError
} = require('../errors/AppError');

const { todayInVietnam, isIsoDate } = require('../utils/date');

/** Trạng thái còn nhận báo giá / còn chấp thuận được. */
const OPEN_STATUSES = ['sent', 'bidding'];
const CANCELLABLE_STATUSES = ['draft', ...OPEN_STATUSES];

/**
 * Máy trạng thái yêu cầu báo giá:
 * draft → sent → bidding → accepted → in_production → delivered.
 * draft, sent và bidding cũng có thể chuyển sang cancelled.
 * Mọi chuyển trạng thái chạy trong transaction IMMEDIATE và kiểm tra lại trạng thái
 * bên trong transaction; chấp thuận báo giá dùng thêm khóa lạc quan theo `version`.
 */
class QuoteService {
  /**
   * @param {import('../db/DatabaseAdapter')} [adapter] Bỏ trống để dùng CSDL của ứng dụng.
   */
  constructor(adapter) {
    this.quotes = adapter ? Quote.withAdapter(adapter) : Quote;
    this.bids = adapter ? Bid.withAdapter(adapter) : Bid;
    this.users = adapter ? User.withAdapter(adapter) : User;
    this.db = this.quotes.db;
  }

  /**
   * Kiểm tra và chuẩn hóa dữ liệu yêu cầu báo giá.
   * @param {Object} input
   * @returns {{ title: string, description: string, category: string, quantity: number, deadline: string }}
   */
  validateQuoteInput({ title, description, category, quantity, deadline }) {
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (trimmedTitle.length < 3 || trimmedTitle.length > 200) {
      throw new ValidationError('Tiêu đề yêu cầu bắt buộc và phải từ 3 đến 200 ký tự');
    }

    const trimmedDesc = typeof description === 'string' ? description.trim() : '';
    if (trimmedDesc.length < 5) {
      throw new ValidationError('Mô tả chi tiết yêu cầu bắt buộc và phải từ 5 ký tự trở lên');
    }

    const trimmedCategory = typeof category === 'string' ? category.trim() : '';
    if (!trimmedCategory) {
      throw new ValidationError('Vui lòng chọn danh mục sản phẩm');
    }

    const numQty = typeof quantity === 'string' || typeof quantity === 'number' ? Number(quantity) : NaN;
    if (!Number.isSafeInteger(numQty) || numQty <= 0) {
      throw new ValidationError('Số lượng sản phẩm phải là số nguyên dương lớn hơn 0');
    }

    const trimmedDeadline = typeof deadline === 'string' ? deadline.trim() : '';
    if (!isIsoDate(trimmedDeadline)) {
      throw new ValidationError('Hạn chót báo giá không hợp lệ');
    }
    if (trimmedDeadline < todayInVietnam()) {
      throw new ValidationError('Hạn chót báo giá không được ở quá khứ');
    }

    return {
      title: trimmedTitle,
      description: trimmedDesc,
      category: trimmedCategory,
      quantity: numQty,
      deadline: trimmedDeadline
    };
  }

  /**
   * Lấy yêu cầu hoặc ném 404.
   * @param {number|string} quoteId
   * @returns {Object}
   */
  requireQuote(quoteId) {
    const quote = this.quotes.findById(quoteId);
    if (!quote) {
      throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
    }
    return quote;
  }

  /**
   * Người mua tạo yêu cầu ở trạng thái nháp.
   * @param {{ buyerId: number, title: string, description: string, category: string, quantity: *, deadline: string }} input
   * @returns {Object} Yêu cầu vừa tạo.
   */
  createQuote({ buyerId, ...fields }) {
    if (!buyerId) {
      throw new ForbiddenError('Yêu cầu đăng nhập tài khoản khách mua để tạo báo giá');
    }
    const data = this.validateQuoteInput(fields);
    const quoteId = this.quotes.createDraft({ buyerId, ...data });
    return this.quotes.findById(quoteId);
  }

  /**
   * Kiểm tra quyền của người mua và trạng thái hiện tại trước khi sửa, xóa hoặc hủy.
   * @param {number|string} quoteId
   * @param {number} buyerId
   * @param {string[]} statuses
   * @returns {Object}
   */
  requireBuyerQuote(quoteId, buyerId, statuses) {
    const current = this.requireQuote(quoteId);
    if (current.buyer_id !== buyerId) {
      throw new ForbiddenError('Bạn không có quyền thao tác trên yêu cầu báo giá này');
    }
    if (!statuses.includes(current.status)) {
      throw new ConflictError(`Không thể thực hiện thao tác khi yêu cầu ở trạng thái "${current.status}"`);
    }
    return current;
  }

  /**
   * Lấy bản nháp của người mua để hiển thị biểu mẫu chỉnh sửa.
   * @param {{quoteId: number|string, buyerId: number}} input
   * @returns {Object}
   */
  getDraftForEdit({ quoteId, buyerId }) {
    return this.requireBuyerQuote(quoteId, buyerId, ['draft']);
  }

  /**
   * Kiểm tra và cập nhật bản nháp trong cùng giao dịch ghi.
   * @param {{quoteId: number|string, buyerId: number, title: string, description: string, category: string, quantity: *, deadline: string}} input
   * @returns {Object}
   */
  updateDraft({ quoteId, buyerId, ...fields }) {
    return this.db.transaction(() => {
      const current = this.getDraftForEdit({ quoteId, buyerId });
      const data = this.validateQuoteInput(fields);
      if (!this.quotes.updateDraft(quoteId, buyerId, current.version, data)) {
        throw new ConflictError();
      }
      return this.quotes.findById(quoteId);
    }, { immediate: true });
  }

  /**
   * Xóa bản nháp; không cho xóa yêu cầu đã gửi đi.
   * @param {{quoteId: number|string, buyerId: number}} input
   */
  deleteDraft({ quoteId, buyerId }) {
    this.db.transaction(() => {
      const current = this.getDraftForEdit({ quoteId, buyerId });
      if (!this.quotes.deleteDraft(quoteId, buyerId, current.version)) {
        throw new ConflictError();
      }
    }, { immediate: true });
  }

  /**
   * Hủy yêu cầu chưa chốt và đồng thời từ chối các chào giá đã gửi.
   * @param {{quoteId: number|string, buyerId: number}} input
   * @returns {Object}
   */
  cancelQuote({ quoteId, buyerId }) {
    return this.db.transaction(() => {
      const current = this.requireBuyerQuote(quoteId, buyerId, CANCELLABLE_STATUSES);
      if (!this.quotes.transitionStatus(quoteId, {
        from: CANCELLABLE_STATUSES, to: 'cancelled', expectedVersion: current.version
      })) {
        throw new ConflictError();
      }
      this.db.update(this.bids.table, { status: 'rejected', updated_at: this.db.now() }, {
        quote_id: quoteId, status: 'submitted'
      });
      return this.quotes.findById(quoteId);
    }, { immediate: true });
  }

  /**
   * Gửi bản nháp tới các nghệ nhân phù hợp. draft → sent.
   * @param {{ quoteId: number|string, buyerId: number }} input
   * @returns {Object}
   */
  sendQuote({ quoteId, buyerId }) {
    return this.db.transaction(() => {
      const current = this.requireBuyerQuote(quoteId, buyerId, ['draft']);
      const targetArtisanIds = this.quotes.findApprovedArtisansForCategory(current.category);
      if (targetArtisanIds.length === 0) {
        throw new ValidationError('Hiện chưa có nghệ nhân nào được duyệt trong hệ thống để tiếp nhận yêu cầu báo giá');
      }

      this.quotes.insertTargets(quoteId, targetArtisanIds);

      const changes = this.quotes.transitionStatus(quoteId, {
        from: ['draft'],
        to: 'sent',
        expectedVersion: current.version
      });
      if (changes === 0) {
        throw new ConflictError('Xung đột dữ liệu khi gửi yêu cầu báo giá. Vui lòng tải lại trang.');
      }
      return this.quotes.findById(quoteId);
    }, { immediate: true });
  }

  /**
   * Nghệ nhân được mời gửi hoặc sửa báo giá. Báo giá đầu tiên chuyển sent → bidding.
   * @param {{ quoteId: number|string, artisanId: number, unitPrice: *, leadDays: *, completionDate: string, note?: string }} input
   * @returns {Object} Báo giá sau khi ghi.
   */
  submitOrUpdateBid({ quoteId, artisanId, unitPrice, leadDays, completionDate, note }) {
    const artisan = this.users.findById(artisanId);
    if (!artisan || artisan.role !== 'artisan' || artisan.status !== 'approved') {
      throw new ForbiddenError('Chỉ nghệ nhân đã được phê duyệt mới có thể chào giá');
    }

    if (!this.quotes.isArtisanTargeted(quoteId, artisanId)) {
      throw new ForbiddenError('Bạn không thuộc danh sách nghệ nhân được mời chào giá cho yêu cầu này');
    }

    const numPrice = Number(unitPrice);
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      throw new ValidationError('Đơn giá chào phải là số dương lớn hơn 0');
    }

    const numDays = Number(leadDays);
    if (!Number.isInteger(numDays) || numDays <= 0) {
      throw new ValidationError('Thời gian sản xuất (ngày) phải là số nguyên dương');
    }

    const trimmedDate = typeof completionDate === 'string' ? completionDate.trim() : '';
    if (!isIsoDate(trimmedDate)) {
      throw new ValidationError('Ngày hoàn thành dự kiến không hợp lệ');
    }
    if (trimmedDate < todayInVietnam()) {
      throw new ValidationError('Ngày hoàn thành dự kiến không được ở quá khứ');
    }

    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    return this.db.transaction(() => {
      const current = this.requireQuote(quoteId);
      if (!OPEN_STATUSES.includes(current.status)) {
        throw new ConflictError(`Không thể chào giá do yêu cầu đang ở trạng thái "${current.status}"`);
      }

      const bid = this.bids.upsert({
        quoteId,
        artisanId,
        unitPrice: numPrice,
        leadDays: numDays,
        completionDate: trimmedDate,
        note: trimmedNote
      });

      // Mọi lần gửi/sửa báo giá đều tăng version: trang người mua mở trước đó trở nên cũ,
      // nên không thể chốt một báo giá mà họ chưa nhìn thấy giá mới nhất.
      const changes = this.quotes.transitionStatus(quoteId, {
        from: [current.status],
        to: 'bidding',
        expectedVersion: current.version
      });
      if (changes === 0) {
        throw new ConflictError('Xung đột trạng thái khi cập nhật yêu cầu báo giá');
      }

      return bid;
    }, { immediate: true });
  }

  /**
   * Người mua chốt một báo giá (khóa lạc quan theo version). sent/bidding → accepted.
   * @param {{ quoteId: number|string, buyerId: number, bidId: number, version: * }} input
   * @returns {Object}
   */
  acceptBid({ quoteId, buyerId, bidId, version }) {
    if (version === undefined || version === null || Number.isNaN(Number(version))) {
      throw new ValidationError('Thiếu thông tin phiên bản kiểm soát xung đột (version)');
    }
    const expectedVersion = Number(version);

    const quote = this.requireQuote(quoteId);
    if (quote.buyer_id !== buyerId) {
      throw new ForbiddenError('Bạn không có quyền chấp thuận báo giá của yêu cầu này');
    }
    if (!OPEN_STATUSES.includes(quote.status)) {
      throw new ConflictError(`Yêu cầu báo giá không ở trạng thái có thể chấp thuận (trạng thái: ${quote.status})`);
    }

    const bid = this.bids.findById(bidId);
    if (!bid || bid.quote_id !== Number(quoteId)) {
      throw new ValidationError('Báo giá không tồn tại hoặc không thuộc về yêu cầu này');
    }
    if (bid.status !== 'submitted') {
      throw new ConflictError('Báo giá này không ở trạng thái hợp lệ để chấp thuận');
    }

    this.db.transaction(() => {
      const current = this.requireQuote(quoteId);
      if (current.buyer_id !== buyerId) {
        throw new ForbiddenError('Quyền truy cập bị từ chối');
      }
      if (!OPEN_STATUSES.includes(current.status)) {
        throw new ConflictError('Yêu cầu báo giá đã được xử lý hoặc đã chốt ở phiên khác');
      }
      if (Number(current.version) !== expectedVersion) {
        throw new ConflictError('Dữ liệu yêu cầu báo giá đã thay đổi bởi phiên làm việc khác. Vui lòng tải lại trang.');
      }

      const freshBid = this.bids.findById(bidId);
      if (!freshBid || freshBid.quote_id !== Number(quoteId) || freshBid.status !== 'submitted') {
        throw new ConflictError('Báo giá được chọn không còn khả dụng để chấp thuận');
      }

      const changes = this.quotes.transitionStatus(quoteId, {
        from: OPEN_STATUSES,
        to: 'accepted',
        expectedVersion,
        acceptedBidId: bidId
      });
      if (changes === 0) {
        throw new ConflictError('Xung đột khi chấp thuận báo giá. Giao dịch khác đã hoàn tất trước đó.');
      }

      this.bids.acceptBid(bidId);
      this.bids.rejectOtherBids(quoteId, bidId);
    }, { immediate: true });

    return this.quotes.findById(quoteId);
  }

  /**
   * Chuyển trạng thái do nghệ nhân trúng thầu thực hiện.
   * @param {{ quoteId: number|string, artisanId: number, from: string, to: string, forbiddenMessage: string, label: string }} input
   * @returns {Object}
   */
  advanceByWinningArtisan({ quoteId, artisanId, from, to, forbiddenMessage, label }) {
    const quote = this.requireQuote(quoteId);
    if (quote.accepted_artisan_id !== artisanId) {
      throw new ForbiddenError(forbiddenMessage);
    }
    if (quote.status !== from) {
      throw new ConflictError(`Không thể chuyển sang "${label}" từ trạng thái "${quote.status}". Yêu cầu phải ở trạng thái "${from}".`);
    }

    this.db.transaction(() => {
      const current = this.requireQuote(quoteId);
      if (current.accepted_artisan_id !== artisanId) {
        throw new ForbiddenError('Quyền truy cập bị từ chối');
      }
      if (current.status !== from) {
        throw new ConflictError(`Trạng thái yêu cầu báo giá đã thay đổi: ${current.status}`);
      }
      if (this.quotes.transitionStatus(quoteId, { from: [from], to }) === 0) {
        throw new ConflictError(`Không thể cập nhật trạng thái sang ${label}`);
      }
    }, { immediate: true });

    return this.quotes.findById(quoteId);
  }

  /**
   * accepted → in_production.
   * @param {{ quoteId: number|string, artisanId: number }} input
   * @returns {Object}
   */
  startProduction({ quoteId, artisanId }) {
    return this.advanceByWinningArtisan({
      quoteId,
      artisanId,
      from: 'accepted',
      to: 'in_production',
      forbiddenMessage: 'Chỉ nghệ nhân được chấp thuận đơn hàng mới có thể bắt đầu sản xuất',
      label: 'Đang sản xuất'
    });
  }

  /**
   * in_production → delivered.
   * @param {{ quoteId: number|string, artisanId: number }} input
   * @returns {Object}
   */
  deliverQuote({ quoteId, artisanId }) {
    return this.advanceByWinningArtisan({
      quoteId,
      artisanId,
      from: 'in_production',
      to: 'delivered',
      forbiddenMessage: 'Chỉ nghệ nhân được chấp thuận đơn hàng mới có thể giao hàng',
      label: 'Đã giao hàng'
    });
  }

  /**
   * Chi tiết yêu cầu theo vai trò. Người mua chỉ xem yêu cầu của mình; nghệ nhân chỉ
   * xem yêu cầu đã gửi và có mời mình (trả 404 để không lộ sự tồn tại); admin xem tất cả.
   * @param {number|string} quoteId
   * @param {{ id: number, role: string }} user
   * @returns {Object}
   */
  getQuoteDetailForUser(quoteId, user) {
    if (!user) {
      throw new ForbiddenError('Vui lòng đăng nhập để xem thông tin báo giá');
    }

    const quote = this.requireQuote(quoteId);

    if (user.role === 'buyer') {
      if (quote.buyer_id !== user.id) {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }
      return {
        quote,
        bids: this.bids.findByQuoteId(quoteId),
        targets: this.quotes.getTargets(quoteId),
        isOwner: true,
        isArtisan: false,
        isAdmin: false
      };
    }

    if (user.role === 'artisan') {
      if (quote.status === 'draft' || !this.quotes.isArtisanTargeted(quoteId, user.id)) {
        throw new NotFoundError('Không tìm thấy yêu cầu báo giá');
      }
      this.quotes.markSeen(quoteId, user.id);
      return {
        quote,
        myBid: this.bids.findByQuoteAndArtisan(quoteId, user.id),
        totalBidsCount: this.bids.countBy({ quote_id: quote.id }),
        isWinner: quote.accepted_artisan_id === user.id,
        isOwner: false,
        isArtisan: true,
        isAdmin: false
      };
    }

    if (user.role === 'admin') {
      return {
        quote,
        bids: this.bids.findByQuoteId(quoteId),
        targets: this.quotes.getTargets(quoteId),
        isOwner: false,
        isArtisan: false,
        isAdmin: true
      };
    }

    throw new ForbiddenError('Quyền truy cập không hợp lệ');
  }

  /**
   * Danh sách yêu cầu theo vai trò.
   * @param {{ id: number, role: string }} user
   * @returns {Object[]}
   */
  listQuotesForUser(user) {
    if (!user) {
      throw new ForbiddenError('Vui lòng đăng nhập');
    }
    if (user.role === 'buyer') {
      return this.quotes.findByBuyerId(user.id);
    }
    if (user.role === 'artisan') {
      return this.quotes.findByArtisanId(user.id);
    }
    if (user.role === 'admin') {
      return this.quotes.findAllWithStats();
    }
    return [];
  }
}

const quoteService = new QuoteService();

module.exports = quoteService;
module.exports.QuoteService = QuoteService;
