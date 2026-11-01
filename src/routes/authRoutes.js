const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');

router.get('/login', authController.getLogin);
router.post('/login', authLimiter, authController.postLogin);

router.get('/register', authController.getRegister);
router.post('/register', authLimiter, authController.postRegister);

router.post('/logout', authController.postLogout);

module.exports = router;
