const { ApiError } = require('../utils/errors');

const errorHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof ApiError || err.status ? err.status : 500;
  const error = err.error || (status === 500 ? 'internal_error' : 'error');
  const details = err.details || (status === 500 ? 'Internal server error' : err.message);

  if (status >= 500) {
    console.error('Unhandled error', err);
  }

  const payload = { error };
  if (details) {
    payload.details = details;
  }

  return res.status(status).json(payload);
};

module.exports = errorHandler;
