const BaseModel = require('./BaseModel');

/** Lưu thông tin đơn mua cùng bản chụp tên, slug và giá sản phẩm. */
class OrderModel extends BaseModel {
  static tableName = 'orders';
}

module.exports = new OrderModel();
