const AuthService = require('../services/auth.service');
const R           = require('../utils/response.util');

const register = async (req, res, next) => {
  try {
    const { user, token } = await AuthService.register(req.body);
    return R.created(res, { user, token }, 'Account registered successfully');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode, err.errors || null);
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { user, token } = await AuthService.login(req.body);
    return R.success(res, { user, token }, 'Login successful');
  } catch (err) {
    if (err.statusCode) return R.error(res, err.message, err.statusCode, err.errors || null);
    next(err);
  }
};

const profile = (req, res) => R.success(res, { user: req.user }, 'Profile retrieved');

module.exports = { register, login, profile };
