const quoteService = require('../services/quoteService');

const DEFAULT_CATEGORIES = [
  'Gốm sứ',
  'Lụa tơ tằm',
  'Mây tre đan',
  'Đồ gỗ mỹ nghệ',
  'Khảm trai',
  'Đồ đồng',
  'Sơn mài',
  'Tranh dân gian'
];

/**
 * Helper to handle errors on detail mutations by either:
 * 1. Returning JSON if requested by XHR / API client
 * 2. Re-rendering the detail page with the matching status code and error message
 * 3. Delegating to Express error handler if detail cannot be fetched
 */
function handleDetailError(req, res, next, err) {
  const status = err.statusCode || 400;

  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(status).json({ error: err.message, status });
  }

  if (req.flash) {
    req.flash('error', err.message);
  }

  try {
    const detail = quoteService.getQuoteDetailForUser(req.params.id, req.user);
    return res.status(status).render('quotes/show', {
      title: `Báo giá #${detail.quote.id} - ${detail.quote.title}`,
      ...detail,
      errorMessage: err.message
    });
  } catch (innerErr) {
    return next(err);
  }
}

const quoteController = {
  /**
   * GET /quotes
   * Role-specific quote listings
   */
  list(req, res, next) {
    try {
      const quotes = quoteService.listQuotesForUser(req.user);
      return res.render('quotes/index', {
        title: 'Yêu cầu Báo giá & Điều phối Đơn hàng',
        quotes
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /quotes/new
   * Buyer new request form
   */
  newForm(req, res) {
    const minDate = new Date().toISOString().slice(0, 10);
    return res.render('quotes/new', {
      title: 'Tạo Yêu cầu Báo giá Mới',
      formData: {},
      categories: DEFAULT_CATEGORIES,
      minDate,
      errorMessage: null
    });
  },

  /**
   * POST /quotes
   * Buyer create request as Draft
   */
  create(req, res, next) {
    const { title, description, category, quantity, deadline } = req.body;
    try {
      const quote = quoteService.createQuote({
        buyerId: req.user.id,
        title,
        description,
        category,
        quantity,
        deadline
      });

      if (req.flash) {
        req.flash('success', 'Đã tạo yêu cầu báo giá ở dạng bản nháp. Bạn hãy kiểm tra lại và gửi đến các nghệ nhân làng nghề.');
      }

      return res.redirect(`/quotes/${quote.id}`);
    } catch (err) {
      if (err instanceof quoteService.ValidationError || err.statusCode === 400) {
        const minDate = new Date().toISOString().slice(0, 10);
        return res.status(400).render('quotes/new', {
          title: 'Tạo Yêu cầu Báo giá Mới',
          formData: req.body,
          categories: DEFAULT_CATEGORIES,
          minDate,
          errorMessage: err.message
        });
      }
      return next(err);
    }
  },

  /**
   * GET /quotes/:id
   * Detail view with role authorization
   */
  show(req, res, next) {
    try {
      const detail = quoteService.getQuoteDetailForUser(req.params.id, req.user);
      return res.render('quotes/show', {
        title: `Báo giá #${detail.quote.id} - ${detail.quote.title}`,
        ...detail,
        errorMessage: null
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).render('errors/404', {
          title: 'Không tìm thấy - 404',
          message: err.message
        });
      }
      if (err.statusCode === 403) {
        return res.status(403).render('errors/403', {
          title: 'Từ chối truy cập - 403',
          message: err.message
        });
      }
      return next(err);
    }
  },

  /**
   * POST /quotes/:id/send
   * Buyer sends draft to matching approved artisans
   */
  send(req, res, next) {
    try {
      quoteService.sendQuote({
        quoteId: req.params.id,
        buyerId: req.user.id
      });

      if (req.flash) {
        req.flash('success', 'Yêu cầu báo giá đã được gửi thành công đến các xưởng nghệ nhân phù hợp trong làng nghề!');
      }

      return res.redirect(`/quotes/${req.params.id}`);
    } catch (err) {
      return handleDetailError(req, res, next, err);
    }
  },

  /**
   * POST /quotes/:id/bids
   * Approved targeted artisan submits or updates bid
   */
  submitBid(req, res, next) {
    const { unitPrice, leadDays, completionDate, note } = req.body;
    try {
      quoteService.submitOrUpdateBid({
        quoteId: req.params.id,
        artisanId: req.user.id,
        unitPrice,
        leadDays,
        completionDate,
        note
      });

      if (req.flash) {
        req.flash('success', 'Báo giá chào của bạn đã được ghi nhận thành công!');
      }

      return res.redirect(`/quotes/${req.params.id}`);
    } catch (err) {
      return handleDetailError(req, res, next, err);
    }
  },

  /**
   * POST /quotes/:id/accept
   * Buyer accepts selected bid with optimistic version locking
   */
  acceptBid(req, res, next) {
    const { bidId, version } = req.body;
    try {
      quoteService.acceptBid({
        quoteId: req.params.id,
        buyerId: req.user.id,
        bidId: Number(bidId),
        version: Number(version)
      });

      if (req.flash) {
        req.flash('success', 'Đã chốt báo giá thành công! Đơn hàng đã được xác nhận và chuyển tiếp cho nghệ nhân bắt đầu chế tác.');
      }

      return res.redirect(`/quotes/${req.params.id}`);
    } catch (err) {
      return handleDetailError(req, res, next, err);
    }
  },

  /**
   * POST /quotes/:id/start
   * Accepted artisan moves state from accepted -> in_production
   */
  startProduction(req, res, next) {
    try {
      quoteService.startProduction({
        quoteId: req.params.id,
        artisanId: req.user.id
      });

      if (req.flash) {
        req.flash('success', 'Đã chuyển đơn hàng sang trạng thái: Đang sản xuất.');
      }

      return res.redirect(`/quotes/${req.params.id}`);
    } catch (err) {
      return handleDetailError(req, res, next, err);
    }
  },

  /**
   * POST /quotes/:id/deliver
   * Accepted artisan moves state from in_production -> delivered
   */
  deliverQuote(req, res, next) {
    try {
      quoteService.deliverQuote({
        quoteId: req.params.id,
        artisanId: req.user.id
      });

      if (req.flash) {
        req.flash('success', 'Đã hoàn thành và chuyển trạng thái đơn hàng sang: Đã giao hàng!');
      }

      return res.redirect(`/quotes/${req.params.id}`);
    } catch (err) {
      return handleDetailError(req, res, next, err);
    }
  }
};

module.exports = quoteController;
