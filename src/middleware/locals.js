const { formatCurrency, formatDate, getStatusBadge } = require('../utils/formatters');
const sanitizeHtml = require('../utils/sanitizeHtml');

/**
 * Chuẩn bị helper, thông báo một lần và dữ liệu chung cho các view EJS.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function localsMiddleware(req, res, next) {
  /**
   * Ghi thông báo vào phiên hiện tại, kể cả sau khi đổi mã phiên đăng nhập.
   * @param {string} type Loại thông báo, hoặc nội dung nếu chỉ truyền một tham số.
   * @param {string} [message] Nội dung thông báo.
   * @returns {void}
   */
  req.flash = (type, message) => {
    if (!req.session) return;
    if (!message) {
      message = type;
      type = 'info';
    }
    (req.session.flash ??= []).push({ type, message });
  };

  res.locals.flash = req.session?.flash || [];
  if (req.session?.flash) delete req.session.flash;

  // Current path & url
  res.locals.currentPath = req.path || '/';
  res.locals.currentUrl = req.originalUrl || '/';

  // Helpers
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDate = formatDate;
  res.locals.getStatusBadge = getStatusBadge;
  res.locals.sanitizeHtml = sanitizeHtml;
  res.locals.showDemoAccounts = process.env.NODE_ENV !== 'production';

  // Current user (can be null or populated by attachUser)
  res.locals.currentUser = req.user || (req.session && req.session.user) || null;

  next();
}

module.exports = localsMiddleware;
