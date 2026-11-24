/**
 * Lỗi nghiệp vụ có mã HTTP đi kèm. Controller và errorHandler đọc `statusCode`
 * để chọn trang lỗi/JSON phù hợp.
 */
class AppError extends Error {
  /**
   * @param {string} message Thông báo hiển thị cho người dùng.
   * @param {number} [statusCode=400]
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/** 400: dữ liệu nhập không hợp lệ. */
class ValidationError extends AppError {
  constructor(message = 'Dữ liệu không hợp lệ') {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

/** 403: không có quyền với tài nguyên. */
class ForbiddenError extends AppError {
  constructor(message = 'Bạn không có quyền thực hiện thao tác này') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/** 404: không tìm thấy hoặc không được phép biết tài nguyên tồn tại. */
class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy dữ liệu yêu cầu') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/** 409: trạng thái/phiên bản dữ liệu đã thay đổi. */
class ConflictError extends AppError {
  constructor(message = 'Dữ liệu đã thay đổi hoặc trạng thái không hợp lệ. Vui lòng tải lại trang.') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
