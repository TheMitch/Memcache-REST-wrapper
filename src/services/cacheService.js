const redis = require('../storage/redisClient');
const config = require('../config');

const encodeTag = (tag) => Buffer.from(tag, 'utf8')
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/u, '');
const objectKey = (namespace, id) => `obj:${namespace}:${id}`;
const tagKey = (tag) => `tag:${encodeTag(tag)}`;

const serializePayload = (payloadBuffer, contentType, tags) => JSON.stringify({
  payload: payloadBuffer.toString('base64'),
  contentType,
  tags,
});

const deserializePayload = (raw) => {
  const data = JSON.parse(raw);
  return {
    contentType: data.contentType,
    tags: data.tags || [],
    payload: Buffer.from(data.payload, 'base64'),
  };
};

const unique = (items) => Array.from(new Set(items));

const cleanupTagSets = async (tags) => {
  if (!tags || !tags.length) {
    return;
  }
  await Promise.all(tags.map(async (tag) => {
    const key = tagKey(tag);
    const size = await redis.scard(key);
    if (!size) {
      await redis.del(key);
    }
  }));
};

const removeFromTagSets = async (objectRedisKey, tags) => {
  if (!tags || !tags.length) {
    return;
  }
  const pipeline = redis.pipeline();
  tags.forEach((tag) => pipeline.srem(tagKey(tag), objectRedisKey));
  await pipeline.exec();
  await cleanupTagSets(tags);
};

const syncTagIndexes = async (objectRedisKey, previousTags, nextTags) => {
  const prev = previousTags || [];
  const next = nextTags || [];
  const toRemove = prev.filter((tag) => !next.includes(tag));
  const toAdd = next.filter((tag) => !prev.includes(tag));

  const pipeline = redis.pipeline();
  toRemove.forEach((tag) => pipeline.srem(tagKey(tag), objectRedisKey));
  toAdd.forEach((tag) => pipeline.sadd(tagKey(tag), objectRedisKey));
  await pipeline.exec();
  await cleanupTagSets(toRemove);
};

const deleteObjectByKey = async (key) => {
  const existing = await redis.get(key);
  if (!existing) {
    await redis.del(key);
    return false;
  }
  const parsed = deserializePayload(existing);
  await redis.del(key);
  await removeFromTagSets(key, parsed.tags);
  return true;
};

const putObject = async ({ namespace, id, payload, contentType, tags, ttlSeconds }) => {
  const redisKey = objectKey(namespace, id);
  const existingValue = await redis.get(redisKey);
  let existingTags = [];
  if (existingValue) {
    const parsed = deserializePayload(existingValue);
    existingTags = parsed.tags || [];
  }

  const serialized = serializePayload(payload, contentType, tags);
  const effectiveTtlSeconds = ttlSeconds ?? config.ttl.defaultSeconds;

  if (effectiveTtlSeconds) {
    await redis.set(redisKey, serialized, 'EX', effectiveTtlSeconds);
  } else {
    await redis.set(redisKey, serialized);
  }

  await syncTagIndexes(redisKey, existingTags, tags);
};

const getObject = async (namespace, id) => {
  const redisKey = objectKey(namespace, id);
  const existing = await redis.get(redisKey);
  if (!existing) {
    return null;
  }
  return deserializePayload(existing);
};

const deleteObject = async (namespace, id) => {
  const redisKey = objectKey(namespace, id);
  const existing = await redis.get(redisKey);
  if (!existing) {
    await redis.del(redisKey);
    return false;
  }
  const parsed = deserializePayload(existing);
  await redis.del(redisKey);
  await removeFromTagSets(redisKey, parsed.tags);
  return true;
};

const invalidateByTag = async (tag) => {
  const membershipKey = tagKey(tag);
  const objectKeys = await redis.smembers(membershipKey);
  if (!objectKeys.length) {
    await redis.del(membershipKey);
    return { invalidatedCount: 0 };
  }

  let count = 0;
  for (const objectKeyValue of unique(objectKeys)) {
    const deleted = await deleteObjectByKey(objectKeyValue);
    if (deleted) {
      count += 1;
    } else {
      await redis.srem(membershipKey, objectKeyValue);
    }
  }

  await redis.del(membershipKey);
  return { invalidatedCount: count };
};

const invalidateByTags = async (tags, match) => {
  if (!tags.length) {
    return { invalidatedCount: 0 };
  }
  const membershipKeys = tags.map((tag) => tagKey(tag));
  let objectKeys = [];
  if (match === 'all') {
    objectKeys = await redis.sinter(...membershipKeys);
  } else {
    objectKeys = await redis.sunion(...membershipKeys);
  }

  if (!objectKeys || !objectKeys.length) {
    await cleanupTagSets(tags);
    return { invalidatedCount: 0 };
  }

  let count = 0;
  for (const key of unique(objectKeys)) {
    const deleted = await deleteObjectByKey(key);
    if (deleted) {
      count += 1;
    } else {
      const pipeline = redis.pipeline();
      membershipKeys.forEach((setKey) => pipeline.srem(setKey, key));
      await pipeline.exec();
    }
  }

  await cleanupTagSets(tags);
  return { invalidatedCount: count };
};

module.exports = {
  putObject,
  getObject,
  deleteObject,
  invalidateByTag,
  invalidateByTags,
};
