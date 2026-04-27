const { forbidden } = require('../utils/response.util');

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user)                   return forbidden(res, 'No authenticated user');
  if (!roles.includes(req.user.role)) return forbidden(res, `Role '${req.user.role}' is not permitted for this action`);
  next();
};

module.exports = {
  requireRole,
  isPrincipal: requireRole('principal'),
  isTeacher:   requireRole('teacher'),
  isAnyRole:   requireRole('principal', 'teacher'),
};
