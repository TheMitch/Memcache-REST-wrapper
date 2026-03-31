const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIdentityPart,
  normalizeTags,
  parseTtlSeconds,
} = require('../src/utils/validation');

test('normalizeIdentityPart accepts valid namespace/id', () => {
  const value = normalizeIdentityPart('namespace-123', 'namespace');
  assert.equal(value, 'namespace-123');
});

test('normalizeIdentityPart rejects invalid characters', () => {
  assert.throws(() => normalizeIdentityPart('bad value', 'namespace'));
});

test('normalizeTags enforces limits and dedup', () => {
  const result = normalizeTags(['tag-1', 'tag-1', 'tag-2']);
  assert.deepEqual(result, ['tag-1', 'tag-2']);
});

test('normalizeTags splits comma separated headers when enabled', () => {
  const result = normalizeTags('tag-1, tag-2,tag-1', { splitCsv: true });
  assert.deepEqual(result, ['tag-1', 'tag-2']);
});

test('normalizeTags rejects empty tag', () => {
  assert.throws(() => normalizeTags(['']));
});

test('normalizeTags rejects commas in tags', () => {
  assert.throws(() => normalizeTags(['bad,tag']));
});

test('parseTtlSeconds returns null when absent', () => {
  assert.equal(parseTtlSeconds(undefined), null);
});

test('parseTtlSeconds enforces numeric input', () => {
  assert.throws(() => parseTtlSeconds('abc'));
});
