const Redis = require('ioredis');
const config = require('../config');

const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error', err);
});

module.exports = redis;
