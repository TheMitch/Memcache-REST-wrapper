const express = require('express');
const redis = require('../storage/redisClient');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(async (_req, res) => {
  await redis.ping();
  res.json({ status: 'ok', redis: 'ok' });
}));

module.exports = router;