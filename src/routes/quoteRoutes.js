const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const { requireAuth, requireRole, requireApprovedArtisan } = require('../middleware/auth');

const requireBuyer = requireRole('buyer');

// List quotes (buyer sees own, artisan sees targeted, admin sees all)
router.get('/', requireAuth, quoteController.list);

// Buyer new request form & creation (draft)
router.get('/new', requireBuyer, quoteController.newForm);
router.post('/', requireBuyer, quoteController.create);

// Detail view with role authorization
router.get('/:id(\\d+)', requireAuth, quoteController.show);

router.get('/:id(\\d+)/edit', requireBuyer, quoteController.editForm);
router.put('/:id(\\d+)', requireBuyer, quoteController.updateDraft);
router.delete('/:id(\\d+)', requireBuyer, quoteController.deleteDraft);
router.patch('/:id(\\d+)/cancel', requireBuyer, quoteController.cancelQuote);

// Buyer sends draft to matching approved artisans
router.post('/:id(\\d+)/send', requireBuyer, quoteController.send);

// Approved artisan submits or updates bid
router.post('/:id(\\d+)/bids', requireApprovedArtisan, quoteController.submitBid);

// Buyer accepts bid with optimistic locking
router.post('/:id(\\d+)/accept', requireBuyer, quoteController.acceptBid);

// Accepted artisan starts production
router.post('/:id(\\d+)/start', requireApprovedArtisan, quoteController.startProduction);

// Accepted artisan marks production delivered
router.post('/:id(\\d+)/deliver', requireApprovedArtisan, quoteController.deliverQuote);

module.exports = router;
