const config = require('../config');
const { badRequest } = require('./errors');

const ID_REGEX = /^[A-Za-z0-9._-]+$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

const assertLength = (value, label) => {
  if (value.length < config.minIdLength || value.length > config.maxIdLength) {
    throw badRequest(`${label} must be ${config.minIdLength}..${config.maxIdLength} characters`);
  }
};

const assertUrlSafe = (value, label) => {
  if (!ID_REGEX.test(value)) {
    throw badRequest(`${label} must contain only URL-safe characters (A-Z a-z 0-9 . _ -)`);
  }
};

const assertPrintableAscii = (value) => {
  if (!PRINTABLE_ASCII.test(value)) {
    throw badRequest('Tags must contain printable ASCII characters only');
  }
};

const assertNoComma = (value) => {
  if (value.includes(',')) {
    throw badRequest('Tags must not contain commas');
  }
};

const normalizeIdentityPart = (value, label) => {
  if (!value && value !== 0) {
    throw badRequest(`${label} is required`);
  }
  const trimmed = String(value).trim();
  assertLength(trimmed, label);
  assertUrlSafe(trimmed, label);
  return trimmed;
};

const normalizeTags = (rawTags, options = {}) => {
  const splitCsv = options.splitCsv === true;
  const values = [];
  if (!rawTags) {
    return [];
  }
  const rawValues = Array.isArray(rawTags) ? rawTags : [rawTags];
  rawValues.forEach((tagValue) => {
    if (typeof tagValue === 'undefined') {
      return;
    }
    const tagString = String(tagValue);
    if (splitCsv) {
      tagString.split(',').forEach((tag) => values.push(tag));
    } else {
      values.push(tagString);
    }
  });

  const normalized = [];
  const seen = new Set();

  values.forEach((tagValue) => {
    const tag = String(tagValue).trim();
    if (!tag) {
      throw badRequest('Tag values cannot be empty');
    }
    if (tag.length > config.maxTagLength) {
      throw badRequest(`Tag length must be <= ${config.maxTagLength}`);
    }
    assertPrintableAscii(tag);
    assertNoComma(tag);
    if (!seen.has(tag)) {
      seen.add(tag);
      normalized.push(tag);
    }
  });

  if (normalized.length > config.maxTagsPerObject) {
    throw badRequest(`No more than ${config.maxTagsPerObject} tags allowed per object`);
  }

  return normalized;
};

const parseTtlSeconds = (rawTtl) => {
  if (rawTtl === undefined) {
    return null;
  }
  const value = Array.isArray(rawTtl) ? rawTtl[0] : rawTtl;
  const ttl = Number(value);
  if (!Number.isInteger(ttl)) {
    throw badRequest('ttlSeconds must be an integer');
  }
  if (ttl < config.ttl.minSeconds || ttl > config.ttl.maxSeconds) {
    throw badRequest(`ttlSeconds must be between ${config.ttl.minSeconds} and ${config.ttl.maxSeconds}`);
  }
  return ttl;
};

const ensureContentType = (req) => {
  const contentType = req.header('Content-Type');
  if (!contentType) {
    throw badRequest('Content-Type header is required');
  }
  return contentType;
};

const validateSingleTag = (value) => {
  if (typeof value === 'undefined') {
    throw badRequest('Tag value is required');
  }
  const tag = String(value).trim();
  if (!tag) {
    throw badRequest('Tag value cannot be empty');
  }
  if (tag.length > config.maxTagLength) {
    throw badRequest(`Tag length must be <= ${config.maxTagLength}`);
  }
  assertPrintableAscii(tag);
  assertNoComma(tag);
  return tag;
};

module.exports = {
  normalizeIdentityPart,
  normalizeTags,
  parseTtlSeconds,
  ensureContentType,
  validateSingleTag,
};
