const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const { requireAuth, requireRole, requireApprovedArtisan } = require('../middleware/auth');

// All quote operations require an authenticated session
router.use(requireAuth);

// List quotes (buyer sees own, artisan sees targeted, admin sees all)
router.get('/', quoteController.list);

// Buyer new request form & creation (draft)
router.get('/new', requireRole('buyer'), quoteController.newForm);
router.post('/', requireRole('buyer'), quoteController.create);

// Detail view with role authorization
router.get('/:id', quoteController.show);

// Buyer sends draft to matching approved artisans
router.post('/:id/send', requireRole('buyer'), quoteController.send);

// Approved artisan submits or updates bid
router.post('/:id/bids', requireApprovedArtisan, quoteController.submitBid);

// Buyer accepts bid with optimistic locking
router.post('/:id/accept', requireRole('buyer'), quoteController.acceptBid);

// Accepted artisan starts production
router.post('/:id/start', requireApprovedArtisan, quoteController.startProduction);

// Accepted artisan marks production delivered
router.post('/:id/deliver', requireApprovedArtisan, quoteController.deliverQuote);

module.exports = router;
