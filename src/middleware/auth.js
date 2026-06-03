const config = require('../config');

const authMiddleware = (req, res, next) => {
  if (config.apiKeys.length === 0) {
    return next();
  }

  const providedKey = req.header('X-API-Key');
  if (providedKey && config.apiKeys.includes(providedKey)) {
    return next();
  }

  return res.status(401).json({ error: 'unauthorized', details: 'Valid API key required' });
};

module.exports = authMiddleware;
