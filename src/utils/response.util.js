const success = (res, data, message = 'Success', statusCode = 200) => {
  const body = { success: true, message };
  if (data !== undefined && data !== null) body.data = data;
  return res.status(statusCode).json(body);
};

const created = (res, data, message = 'Created') =>
  success(res, data, message, 201);

const error = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const badRequest   = (res, message = 'Bad Request', errors = null) => error(res, message, 400, errors);
const unauthorized = (res, message = 'Unauthorized')                => error(res, message, 401);
const forbidden    = (res, message = 'Forbidden — insufficient permissions') => error(res, message, 403);
const notFound     = (res, message = 'Resource not found')          => error(res, message, 404);
const conflict     = (res, message = 'Resource already exists')     => error(res, message, 409);
const unprocessable= (res, message = 'Unprocessable entity')        => error(res, message, 422);

module.exports = { success, created, error, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
