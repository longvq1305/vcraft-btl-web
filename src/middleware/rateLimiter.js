const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  /**
   * Thông báo khi yêu cầu xác thực vượt quá giới hạn.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {void}
   */
  handler: (req, res) => {
    if (req.flash) {
      req.flash('error', 'Quá nhiều yêu cầu từ thiết bị này. Vui lòng thử lại sau ít phút.');
    }
    res.status(429).redirect(req.originalUrl || '/auth/login');
  }
});

module.exports = {
  authLimiter
};
