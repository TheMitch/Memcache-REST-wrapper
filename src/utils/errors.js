class ApiError extends Error {
  constructor(status, error, details) {
    super(details || error);
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

const badRequest = (message) => new ApiError(400, 'bad_request', message);
const unsupportedMedia = (message) => new ApiError(415, 'unsupported_media_type', message);
const unauthorized = (message) => new ApiError(401, 'unauthorized', message);
const notFound = (message) => new ApiError(404, 'not_found', message);

module.exports = {
  ApiError,
  badRequest,
  unsupportedMedia,
  unauthorized,
  notFound,
};