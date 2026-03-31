const express = require('express');
const cacheService = require('../services/cacheService');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const {
  normalizeIdentityPart,
  normalizeTags,
  parseTtlSeconds,
  ensureContentType,
} = require('../utils/validation');
const { notFound } = require('../utils/errors');

const router = express.Router();
const rawBody = express.raw({ type: () => true, limit: config.payloadLimit });

router.put('/:namespace/:id', rawBody, asyncHandler(async (req, res) => {
  const namespace = normalizeIdentityPart(req.params.namespace, 'namespace');
  const id = normalizeIdentityPart(req.params.id, 'id');
  const contentType = ensureContentType(req);
  const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const tags = normalizeTags(req.headers['x-tag'], { splitCsv: true });
  const ttlSeconds = parseTtlSeconds(req.query.ttlSeconds);
  const effectiveTtlSeconds = ttlSeconds ?? config.ttl.defaultSeconds;

  await cacheService.putObject({
    namespace,
    id,
    payload,
    contentType,
    tags,
    ttlSeconds: effectiveTtlSeconds,
  });

  res.status(201).json({ namespace, id, ttlSeconds: effectiveTtlSeconds, tags });
}));

router.get('/:namespace/:id', asyncHandler(async (req, res) => {
  const namespace = normalizeIdentityPart(req.params.namespace, 'namespace');
  const id = normalizeIdentityPart(req.params.id, 'id');
  const record = await cacheService.getObject(namespace, id);
  if (!record) {
    throw notFound('Object not found');
  }

  if (record.tags && record.tags.length) {
    res.set('X-Tag', record.tags.join(', '));
  }
  res.set('Content-Type', record.contentType);
  res.status(200).send(record.payload);
}));

router.delete('/:namespace/:id', asyncHandler(async (req, res) => {
  const namespace = normalizeIdentityPart(req.params.namespace, 'namespace');
  const id = normalizeIdentityPart(req.params.id, 'id');
  const deleted = await cacheService.deleteObject(namespace, id);
  res.json({ deleted });
}));

module.exports = router;
