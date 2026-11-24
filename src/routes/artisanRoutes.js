const express = require('express');
const router = express.Router();
const artisanController = require('../controllers/artisanController');
const { requireAuth, requireRole, requireApprovedArtisan } = require('../middleware/auth');
const { validateCsrf } = require('../middleware/csrf');
const imageService = require('../services/imageService');

// Require authentication for all artisan routes
router.use(requireAuth);

// Artisan dashboard and profile view
router.get('/dashboard', requireRole('artisan'), artisanController.dashboard);
router.get('/profile', requireRole('artisan'), artisanController.profileForm);

// Profile mutation requires approved artisan status
router.put(
  '/profile',
  requireApprovedArtisan,
  imageService.uploadProfileImages,
  validateCsrf,
  artisanController.updateProfile
);

// Product management routes (approved artisans only)
router.get('/products/new', requireApprovedArtisan, artisanController.newProductForm);
router.post(
  '/products',
  requireApprovedArtisan,
  imageService.uploadProductImages,
  validateCsrf,
  artisanController.createProduct
);

router.get('/products/:id(\\d+)/edit', requireApprovedArtisan, artisanController.editProductForm);
router.put(
  '/products/:id(\\d+)',
  requireApprovedArtisan,
  imageService.uploadProductImages,
  validateCsrf,
  artisanController.updateProduct
);

router.post(
  '/products/:id(\\d+)/steps',
  requireApprovedArtisan,
  imageService.uploadStepImage,
  validateCsrf,
  artisanController.addStep
);

router.delete(
  '/products/:id(\\d+)/steps/:stepId(\\d+)',
  requireApprovedArtisan,
  artisanController.deleteStep
);

router.delete(
  '/products/:id(\\d+)/images/:imageId(\\d+)',
  requireApprovedArtisan,
  artisanController.deleteImage
);

router.delete('/products/:id(\\d+)', requireApprovedArtisan, artisanController.deleteProduct);

module.exports = router;
