const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/', publicController.home);
router.get('/catalog', publicController.catalog);
router.get('/workshops', publicController.workshops);
router.get('/workshops/:slug', publicController.workshopDetail);
router.get('/map', publicController.mapView);

module.exports = router;
