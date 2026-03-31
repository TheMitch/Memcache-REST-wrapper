const config = require('../config');

const authMiddleware = (req, res, next) => {
  if (!config.apiKey) {
    return next();
  }

  const providedKey = req.header('X-API-Key');
  if (providedKey && providedKey === config.apiKey) {
    return next();
  }

  return res.status(401).json({ error: 'unauthorized', details: 'Valid API key required' });
};

module.exports = authMiddleware;