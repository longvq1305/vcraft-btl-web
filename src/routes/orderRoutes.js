const express = require('express');
const orderController = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const requireBuyer = requireRole('buyer');

router.get('/', requireAuth, orderController.list);
router.get('/:id(\\d+)', requireAuth, orderController.show);
router.post('/', requireBuyer, orderController.create);
router.patch('/:id(\\d+)/cancel', requireBuyer, orderController.cancel);

module.exports = router;
