const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

router.get('/', newsController.getIndex);
router.get('/:slug', newsController.getDetail);

module.exports = router;
