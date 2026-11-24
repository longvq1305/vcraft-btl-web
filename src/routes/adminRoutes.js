const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');

// All admin routes require admin role
router.use(requireAuth, requireRole('admin'));

router.get('/', adminController.getDashboard);

// Artisan administration
router.get('/artisans/new', adminController.getNewArtisan);
router.post('/artisans/new', adminController.postNewArtisan);
router.patch('/artisans/:id(\\d+)/status', adminController.patchArtisanStatus);

// News administration
router.get('/news', adminController.getNewsList);
router.get('/news/new', adminController.getNewsNew);
router.post('/news', adminController.postNewsNew);
router.get('/news/:id(\\d+)/edit', adminController.getNewsEdit);
router.put('/news/:id(\\d+)', adminController.postNewsEdit);
router.delete('/news/:id(\\d+)', adminController.postNewsDelete);

module.exports = router;
