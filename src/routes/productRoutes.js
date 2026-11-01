const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Product story route must be defined or handled appropriately
router.get('/:slug/story', productController.story);
router.get('/:slug/qr.png', productController.qrCode);
router.get('/:slug', productController.show);

module.exports = router;
