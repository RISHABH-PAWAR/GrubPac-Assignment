const jwt = require('jsonwebtoken');

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }
  return secret;
};

const sign = (payload) => {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer:   'content-broadcasting-system',
    audience: 'cbs-api',
  });
};

const verify = (token) => {
  return jwt.verify(token, getSecret(), {
    issuer:   'content-broadcasting-system',
    audience: 'cbs-api',
  });
};

module.exports = { sign, verify };
