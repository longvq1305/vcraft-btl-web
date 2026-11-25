const quoteService = require('../services/quoteService');
const { ValidationError } = require('../errors/AppError');
const { todayInVietnam } = require('../utils/date');

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
 * Trả lỗi JSON cho yêu cầu API; nếu không thì hiển thị lỗi trên trang chi tiết
 * hoặc chuyển cho middleware lỗi khi người dùng không xem được yêu cầu.
 */
function handleDetailError(req, res, next, err) {
  const status = err.statusCode || 400;

  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(status).json({ error: err.message, status });
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

function cleanQueryText(value, maxLen = 150) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/**
 * Hiển thị biểu mẫu tạo hoặc sửa, giữ lại dữ liệu đã nhập nếu kiểm tra thất bại.
 * @param {import('express').Response} res
 * @param {{quote?: Object, formData?: Object, prefillSource?: Object|null, errorMessage?: string}} [options]
 */
function renderQuoteForm(res, { quote, formData = {}, prefillSource = null, errorMessage = null } = {}) {
  const categories = [...DEFAULT_CATEGORIES];
  if (typeof formData.category === 'string' && formData.category && !categories.includes(formData.category)) {
    categories.push(formData.category);
  }
  return res.render(quote ? 'quotes/edit' : 'quotes/new', {
    title: quote ? `Sửa yêu cầu báo giá #${quote.id}` : 'Tạo Yêu cầu Báo giá Mới',
    quote,
    formData,
    prefillSource,
    categories,
    minDate: todayInVietnam(),
    errorMessage
  });
}

const quoteController = {
  /**
   * GET /quotes — danh sách yêu cầu theo vai trò.
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
   * GET /quotes/new — biểu mẫu tạo yêu cầu (hỗ trợ điền sẵn ngữ cảnh từ trang tác phẩm/xưởng).
   */
  newForm(req, res) {
    const category = cleanQueryText(req.query.category, 80);
    const product = cleanQueryText(req.query.product, 150);
    const workshop = cleanQueryText(req.query.workshop, 150);
    const ref = cleanQueryText(req.query.ref, 120);

    const formData = {};
    if (category) {
      formData.category = category;
    }
    if (product) {
      formData.title = `Đặt chế tác theo mẫu: ${product}`.slice(0, 200);
      formData.description = `Tham khảo tác phẩm mẫu: ${product}${workshop ? ' (' + workshop + ')' : ''}.\nYêu cầu chi tiết về kích thước, chất liệu, họa tiết: `;
    } else if (workshop) {
      formData.title = `Đặt chế tác riêng tại ${workshop}`.slice(0, 200);
      formData.description = `Mong muốn đặt chế tác thủ công (tham khảo phong cách ${workshop}).\nYêu cầu chi tiết về sản phẩm, kích thước, số lượng dự kiến: `;
    }

    const prefillSource = (product || workshop)
      ? {
          product,
          workshop,
          backUrl: /^[a-z0-9-]+$/i.test(ref)
            ? (product ? `/products/${ref}` : `/workshops/${ref}`)
            : ''
        }
      : null;

    return renderQuoteForm(res, { formData, prefillSource });
  },

  /**
   * POST /quotes — người mua tạo bản nháp.
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
      if (err instanceof ValidationError) {
        return renderQuoteForm(res.status(400), { formData: req.body, errorMessage: err.message });
      }
      return next(err);
    }
  },

  /** GET /quotes/:id/edit — hiển thị biểu mẫu sửa bản nháp của chủ sở hữu. */
  editForm(req, res, next) {
    try {
      const quote = quoteService.getDraftForEdit({ quoteId: req.params.id, buyerId: req.user.id });
      return renderQuoteForm(res, { quote, formData: quote });
    } catch (err) {
      return next(err);
    }
  },

  /** PUT /quotes/:id — lưu thay đổi nếu yêu cầu vẫn là bản nháp. */
  updateDraft(req, res, next) {
    const { title, description, category, quantity, deadline } = req.body;
    const quoteId = req.params.id;
    try {
      const quote = quoteService.updateDraft({
        quoteId, buyerId: req.user.id, title, description, category, quantity, deadline
      });
      req.flash('success', 'Đã lưu thay đổi cho bản nháp.');
      return res.redirect(`/quotes/${quote.id}`);
    } catch (err) {
      if (err instanceof ValidationError && !req.xhr && !req.get('accept')?.includes('application/json')) {
        return renderQuoteForm(res.status(400), {
          quote: { id: quoteId }, formData: req.body, errorMessage: err.message
        });
      }
      return next(err);
    }
  },

  /** DELETE /quotes/:id — xóa vĩnh viễn bản nháp của chủ sở hữu. */
  deleteDraft(req, res, next) {
    try {
      quoteService.deleteDraft({ quoteId: req.params.id, buyerId: req.user.id });
      req.flash('success', 'Đã xóa bản nháp yêu cầu báo giá.');
      return res.redirect('/quotes');
    } catch (err) {
      return next(err);
    }
  },

  /** PATCH /quotes/:id/cancel — hủy yêu cầu chưa chốt chào giá. */
  cancelQuote(req, res, next) {
    try {
      const quote = quoteService.cancelQuote({ quoteId: req.params.id, buyerId: req.user.id });
      req.flash('success', 'Đã hủy yêu cầu báo giá.');
      return res.redirect(`/quotes/${quote.id}`);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /quotes/:id — chi tiết theo quyền truy cập.
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
   * POST /quotes/:id/send — gửi bản nháp tới nghệ nhân phù hợp.
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
   * POST /quotes/:id/bids — nghệ nhân được mời gửi hoặc cập nhật chào giá.
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
   * POST /quotes/:id/accept — người mua chốt báo giá với khóa lạc quan.
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
   * POST /quotes/:id/start — nghệ nhân trúng thầu bắt đầu chế tác.
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
   * POST /quotes/:id/deliver — nghệ nhân trúng thầu xác nhận bàn giao.
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
