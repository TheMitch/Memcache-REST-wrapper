const express = require('express');
const cacheService = require('../services/cacheService');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeTags, validateSingleTag } = require('../utils/validation');
const { badRequest } = require('../utils/errors');

const router = express.Router();

router.delete('/:tag', asyncHandler(async (req, res) => {
  const tag = validateSingleTag(req.params.tag);
  const { invalidatedCount } = await cacheService.invalidateByTag(tag);
  res.json({ invalidated: invalidatedCount > 0, tag, count: invalidatedCount });
}));

router.delete('/', asyncHandler(async (req, res) => {
  const rawTags = req.query.tag;
  const tags = normalizeTags(rawTags);
  if (!tags.length) {
    throw badRequest('At least one tag query parameter is required');
  }

  const match = (req.query.match || 'any').toString().toLowerCase();
  if (!['any', 'all'].includes(match)) {
    throw badRequest('match query parameter must be "all" or "any"');
  }

  const { invalidatedCount } = await cacheService.invalidateByTags(tags, match);
  res.json({ invalidated: invalidatedCount > 0, match, count: invalidatedCount });
}));

module.exports = router;