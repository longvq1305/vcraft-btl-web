const orderService = require('../services/orderService');
const Product = require('../models/Product');
const { renderProductPage } = require('./productController');
const { ValidationError, ConflictError } = require('../errors/AppError');

const orderController = {
  /** Hiển thị danh sách đơn hàng phân trang theo vai trò của người dùng. */
  list(req, res, next) {
    try {
      const data = orderService.listOrdersForUser(req.user, { page: req.query.page });
      return res.render('orders/index', { title: 'Đơn hàng', ...data });
    } catch (err) {
      return next(err);
    }
  },

  /** Hiển thị chi tiết một đơn hàng mà người dùng có quyền xem. */
  show(req, res, next) {
    try {
      const order = orderService.getOrderForUser(req.params.id, req.user);
      return res.render('orders/show', { title: `Đơn hàng #${order.id}`, order });
    } catch (err) {
      return next(err);
    }
  },

  /** Đặt mua, hoặc kết xuất lại form và giữ dữ liệu đã nhập khi có lỗi. */
  create(req, res, next) {
    const { productId, quantity, recipientName, phone, shippingAddress, note, requestToken } = req.body;
    const formData = { productId, quantity, recipientName, phone, shippingAddress, note, requestToken };
    try {
      const { order, created } = orderService.placeOrder({ ...formData, buyerId: req.user.id });
      req.flash(created ? 'success' : 'info', created
        ? 'Đã đặt mua sản phẩm thành công.'
        : 'Đơn hàng này đã được ghi nhận trước đó, không tạo thêm đơn mới.');
      return res.redirect(`/orders/${order.id}`);
    } catch (err) {
      const wantsJson = req.xhr || req.get('accept')?.includes('application/json');
      if (!wantsJson && (err instanceof ValidationError || err instanceof ConflictError)) {
        const id = Number(productId);
        if (Number.isSafeInteger(id) && id > 0) {
          const product = Product.findById(id);
          if (product?.status === 'published' && product.artisan_status === 'approved') {
            return renderProductPage(res.status(err.statusCode), product, { formData, message: err.message });
          }
        }
      }
      return next(err);
    }
  },

  /** Hủy đơn và chuyển người mua về trang chi tiết. */
  cancel(req, res, next) {
    try {
      const order = orderService.cancelOrder({ orderId: req.params.id, buyerId: req.user.id });
      req.flash('success', 'Đã hủy đơn hàng.');
      return res.redirect(`/orders/${order.id}`);
    } catch (err) {
      return next(err);
    }
  }
};

module.exports = orderController;
