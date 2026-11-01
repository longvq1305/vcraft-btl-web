const { formatCurrency, formatDate, getStatusBadge } = require('../utils/formatters');

function localsMiddleware(req, res, next) {
  // Flash message support
  if (req.session) {
    req.session.flash = req.session.flash || [];
    req.flash = (type, message) => {
      if (!message) {
        message = type;
        type = 'info';
      }
      req.session.flash.push({ type, message });
    };

    res.locals.flash = [...req.session.flash];
    req.session.flash = [];
  } else {
    req.flash = () => {};
    res.locals.flash = [];
  }

  // Current path & url
  res.locals.currentPath = req.path || '/';
  res.locals.currentUrl = req.originalUrl || '/';

  // Helpers
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDate = formatDate;
  res.locals.getStatusBadge = getStatusBadge;

  // Current user (can be null or populated by attachUser)
  res.locals.currentUser = req.user || (req.session && req.session.user) || null;

  next();
}

module.exports = localsMiddleware;
