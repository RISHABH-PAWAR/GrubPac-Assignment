const { verify }   = require('../utils/jwt.util');
const { unauthorized } = require('../utils/response.util');
const UserModel    = require('../models/user.model');
const logger       = require('../utils/logger.util');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Authorization header missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    if (!token) return unauthorized(res, 'Token not provided');

    let decoded;
    try {
      decoded = verify(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError')  return unauthorized(res, 'Token has expired');
      if (err.name === 'JsonWebTokenError')  return unauthorized(res, 'Invalid token');
      return unauthorized(res, 'Authentication failed');
    }

    const user = await UserModel.findById(decoded.id);
    if (!user)          return unauthorized(res, 'User account not found');
    if (!user.is_active) return unauthorized(res, 'User account is inactive');

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware unexpected error', { error: err.message });
    return unauthorized(res, 'Authentication failed');
  }
};

module.exports = { authenticate };
