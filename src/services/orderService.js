const Order = require('../models/Order');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../errors/AppError');

/** Mã chống gửi trùng sinh bằng crypto.randomUUID() khi hiển thị form đặt mua. */
const REQUEST_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Chuyển giá trị từ form hoặc JSON thành số nguyên dương.
 * @param {*} value
 * @returns {number} NaN nếu giá trị không hợp lệ.
 */
function positiveInteger(value) {
  const number = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : NaN;
}

/**
 * Chuẩn hóa giá trị văn bản từ form.
 * @param {*} value
 * @returns {string}
 */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Giao dịch đặt/hủy đơn mua nhanh và truy cập đơn theo vai trò. */
class OrderService {
  /** @param {import('../db/DatabaseAdapter')} [adapter] Mặc định dùng CSDL ứng dụng. */
  constructor(adapter) {
    this.orders = adapter ? Order.withAdapter(adapter) : Order;
    this.db = this.orders.db;
  }

  /**
   * Đặt mua sản phẩm đã xuất bản của nghệ nhân đã duyệt; trừ kho và ghi đơn nguyên tử.
   * Mỗi lần mở form có một `requestToken` (UUID); cùng token chỉ tạo tối đa một đơn.
   * @param {{buyerId: number, productId: number|string, quantity: number|string, recipientName: string, phone: string, shippingAddress: string, note?: string, requestToken: string}} input
   * @returns {{order: Object, created: boolean}} `created=false` khi token đã được dùng (gửi trùng).
   */
  placeOrder({ buyerId, productId, quantity, recipientName, phone, shippingAddress, note, requestToken }) {
    const id = positiveInteger(productId);
    const units = positiveInteger(quantity);
    const name = text(recipientName);
    const phoneNumber = text(phone);
    const token = text(requestToken).toLowerCase();
    const address = text(shippingAddress);
    if (Number.isNaN(id)) throw new ValidationError('Sản phẩm không hợp lệ.');
    if (Number.isNaN(units)) throw new ValidationError('Số lượng phải là số nguyên dương.');
    if (!name || !address) throw new ValidationError('Vui lòng nhập tên người nhận và địa chỉ giao hàng.');
    if (!/^(0|\+84)\d{9,10}$/.test(phoneNumber)) {
      throw new ValidationError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
    }
    if (!REQUEST_TOKEN_PATTERN.test(token)) {
      throw new ValidationError('Phiên đặt mua không hợp lệ. Vui lòng tải lại trang sản phẩm và thử lại.');
    }

    return this.db.transaction(() => {
      // Gửi lại cùng một form (bấm đúp, F5 sau POST): trả về đơn đã tạo, không trừ kho lần hai.
      const existing = this.orders.findOneBy({ buyer_id: buyerId ?? null, request_token: token });
      if (existing) {
        return { order: existing, created: false };
      }
      if (!this.db.get("SELECT id FROM users WHERE id = ? AND role = 'buyer'", [buyerId ?? null])) {
        throw new ForbiddenError('Chỉ tài khoản người mua mới có thể đặt đơn.');
      }
      const product = this.db.get(`
        SELECT p.name, p.slug, p.price, p.artisan_id
        FROM products p
        JOIN users u ON u.id = p.artisan_id
        WHERE p.id = ? AND p.status = 'published' AND u.role = 'artisan' AND u.status = 'approved'
      `, [id]);
      if (!product) throw new NotFoundError('Không tìm thấy sản phẩm đang mở bán.');

      const { changes } = this.db.run(`
        UPDATE products SET inventory = inventory - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'published' AND inventory >= ?
      `, [units, id, units]);
      if (!changes) throw new ConflictError('Sản phẩm đã hết hàng hoặc không đủ số lượng trong kho.');

      const orderId = this.orders.create({
        buyer_id: buyerId,
        artisan_id: product.artisan_id,
        product_id: id,
        product_name: product.name,
        product_slug: product.slug,
        quantity: units,
        unit_price: product.price,
        total_amount: product.price * units,
        recipient_name: name,
        phone: phoneNumber,
        shipping_address: address,
        note: text(note) || null,
        request_token: token
      });
      return { order: this.orders.findById(orderId), created: true };
    }, { immediate: true });
  }

  /**
   * Hủy đơn của chính người mua và hoàn số lượng vào kho nếu sản phẩm vẫn tồn tại.
   * @param {{orderId: number|string, buyerId: number}} input
   * @returns {Object} Đơn đã hủy.
   */
  cancelOrder({ orderId, buyerId }) {
    return this.db.transaction(() => {
      const order = this.getOrderForUser(orderId, { id: buyerId, role: 'buyer' });
      if (order.status !== 'placed' || !this.db.update(this.orders.table, {
        status: 'cancelled', updated_at: this.db.now()
      }, { id: order.id, buyer_id: buyerId, status: 'placed' })) {
        throw new ConflictError('Đơn hàng không còn ở trạng thái có thể hủy.');
      }
      if (order.product_id !== null) {
        this.db.run(`
          UPDATE products SET inventory = inventory + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [order.quantity, order.product_id]);
      }
      return this.orders.findById(order.id);
    }, { immediate: true });
  }

  /**
   * Áp dụng cùng một phạm vi quyền truy cập cho danh sách và chi tiết.
   * @param {{id: number, role: string}} user
   * @returns {Object}
   */
  scopeForUser(user) {
    if (user?.role === 'buyer') return { buyer_id: user.id };
    if (user?.role === 'artisan') return { artisan_id: user.id };
    if (user?.role === 'admin') return {};
    throw new ForbiddenError('Bạn không có quyền truy cập danh sách đơn hàng.');
  }

  /**
   * Lấy một trang đơn hàng trong phạm vi quyền của người dùng.
   * @param {{id: number, role: string}} user
   * @param {{page?: number|string}} [options]
   * @returns {{items: Object[], pagination: Object}}
   */
  listOrdersForUser(user, { page } = {}) {
    return this.orders.paginate({ where: this.scopeForUser(user), orderBy: 'id DESC', page });
  }

  /**
   * Lấy chi tiết đơn hàng hoặc trả 404 nếu đơn nằm ngoài phạm vi của người dùng.
   * @param {number|string} orderId
   * @param {{id: number, role: string}} user
   * @returns {Object}
   */
  getOrderForUser(orderId, user) {
    const order = this.orders.findOneBy({ id: orderId, ...this.scopeForUser(user) });
    if (!order) throw new NotFoundError('Không tìm thấy đơn hàng.');
    return order;
  }
}

module.exports = new OrderService();
module.exports.OrderService = OrderService;
module.exports.REQUEST_TOKEN_PATTERN = REQUEST_TOKEN_PATTERN;
