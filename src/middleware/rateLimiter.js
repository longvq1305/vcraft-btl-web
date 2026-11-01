const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
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
