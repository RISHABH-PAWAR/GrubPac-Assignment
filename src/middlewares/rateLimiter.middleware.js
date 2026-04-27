const rateLimit = require('express-rate-limit');

const isTest = () => process.env.NODE_ENV === 'test';

const publicApiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip: isTest,
  message: { success: false, message: 'Too many requests — please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip: isTest,
  message: { success: false, message: 'Too many authentication attempts — please try again in 15 minutes' },
});

module.exports = { publicApiLimiter, authLimiter };
