const { Router }     = require('express');
const AuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authLimiter }  = require('../middlewares/rateLimiter.middleware');

const router = Router();

router.post('/register', authLimiter, AuthController.register);
router.post('/login',    authLimiter, AuthController.login);
router.get('/profile',   authenticate, AuthController.profile);

module.exports = router;
