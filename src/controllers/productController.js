const QRCode = require('qrcode');
const Product = require('../models/Product');

const productController = {
  show(req, res, next) {
    try {
      const { slug } = req.params;
      const product = Product.findBySlug(slug);

      if (!product) {
        const err = new Error('Không tìm thấy tác phẩm này.');
        err.status = 404;
        return next(err);
      }

      // Check draft visibility: only owner or admin can view drafts
      if (product.status === 'draft') {
        const currentUser = req.session && req.session.user;
        const isOwner = currentUser && currentUser.id === product.artisan_id;
        const isAdmin = currentUser && currentUser.role === 'admin';

        if (!isOwner && !isAdmin) {
          const err = new Error('Tác phẩm này đang ở chế độ bản nháp và chưa được công khai.');
          err.status = 404;
          return next(err);
        }
      }

      const relatedProducts = Product.getRelatedProducts(product.id, product.category, 4);

      res.render('products/show', {
        title: `${product.name} - vCraft`,
        product,
        relatedProducts
      });
    } catch (err) {
      next(err);
    }
  },

  story(req, res, next) {
    try {
      const { slug } = req.params;
      const product = Product.findBySlug(slug);

      if (!product) {
        const err = new Error('Không tìm thấy tác phẩm hoặc hành trình chế tác.');
        err.status = 404;
        return next(err);
      }

      // Draft access check
      if (product.status === 'draft') {
        const currentUser = req.session && req.session.user;
        const isOwner = currentUser && currentUser.id === product.artisan_id;
        const isAdmin = currentUser && currentUser.role === 'admin';

        if (!isOwner && !isAdmin) {
          const err = new Error('Hành trình chế tác này chưa được công khai.');
          err.status = 404;
          return next(err);
        }
      }

      const qrUrl = `/products/${product.slug}/qr.png`;

      res.render('products/story', {
        title: `Hành trình chế tác & Nguồn gốc: ${product.name} - vCraft`,
        product,
        qrUrl
      });
    } catch (err) {
      next(err);
    }
  },

  async qrCode(req, res, next) {
    try {
      const { slug } = req.params;
      const product = Product.findBySlug(slug);

      if (!product) {
        return res.status(404).send('Không tìm thấy tác phẩm.');
      }

      // Absolute URL to story page
      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost:3000';
      const storyUrl = `${protocol}://${host}/products/${product.slug}/story`;

      // Generate QR code buffer matching visual system (deep ink on warm ivory)
      const buffer = await QRCode.toBuffer(storyUrl, {
        type: 'png',
        width: 320,
        margin: 2,
        color: {
          dark: '#1C2826',
          light: '#FAF7F2'
        }
      });

      res.type('image/png');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = productController;
