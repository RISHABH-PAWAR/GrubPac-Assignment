const logger = require('../utils/logger.util');
const { error } = require('../utils/response.util');

const errorHandler = (err, req, res, _next) => {
  logger.error('Unhandled error', {
    error:  err.message,
    stack:  process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path:   req.path,
    method: req.method,
  });

  // PostgreSQL error codes
  if (err.code === '23505') return error(res, 'A record with this data already exists', 409);
  if (err.code === '23503') return error(res, 'Referenced resource does not exist', 404);
  if (err.code === '22P02') return error(res, 'Invalid UUID format', 400);

  const statusCode = err.statusCode || err.status || 500;
  const message    =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return error(res, message, statusCode);
};

const notFoundHandler = (req, res) =>
  error(res, `Route ${req.method} ${req.originalUrl} not found`, 404);

module.exports = { errorHandler, notFoundHandler };
