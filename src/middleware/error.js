function notFoundHandler(req, res) {
  res.status(404);
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json({ error: 'Không tìm thấy trang hoặc tài nguyên yêu cầu.' });
  }
  return res.render('errors/404', {
    title: 'Không tìm thấy trang - 404',
    message: 'Trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.'
  });
}

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error('[App Error]', err);

  const status = err.status || err.statusCode || 500;
  res.status(status);

  const message = err.message || 'Đã có lỗi hệ thống xảy ra. Vui lòng thử lại sau.';

  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json({ error: message, status });
  }

  if (status === 400) {
    return res.render('errors/400', {
      title: 'Yêu cầu không hợp lệ - 400',
      message
    });
  }

  if (status === 403) {
    return res.render('errors/403', {
      title: 'Không có quyền truy cập - 403',
      message
    });
  }

  if (status === 404) {
    return res.render('errors/404', {
      title: 'Không tìm thấy - 404',
      message
    });
  }

  if (status === 409) {
    return res.render('errors/409', {
      title: 'Xung đột dữ liệu - 409',
      message
    });
  }

  return res.render('errors/500', {
    title: 'Lỗi máy chủ - 500',
    message: process.env.NODE_ENV === 'development' ? err.stack : 'Đã có lỗi xảy ra trong quá trình xử lý yêu cầu.'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
