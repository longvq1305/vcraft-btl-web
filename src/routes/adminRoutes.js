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
router.post('/artisans/:id/approve', adminController.postApproveArtisan);
router.post('/artisans/:id/suspend', adminController.postSuspendArtisan);

// News administration
router.get('/news', adminController.getNewsList);
router.get('/news/new', adminController.getNewsNew);
router.post('/news', adminController.postNewsNew);
router.get('/news/:id/edit', adminController.getNewsEdit);
router.post('/news/:id', adminController.postNewsEdit);
router.post('/news/:id/delete', adminController.postNewsDelete);

module.exports = router;
