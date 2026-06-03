const dotenv = require('dotenv');

dotenv.config();

const apiKeys = [
  process.env.API_KEY,
  process.env.API_KEY_SECONDARY,
]
  .filter((value) => value && value.trim())
  .map((value) => value.trim());

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  apiKeys,
  maxTagsPerObject: 50,
  maxTagLength: 128,
  maxIdLength: 200,
  minIdLength: 1,
  ttl: {
    defaultSeconds: 86_400,
    minSeconds: 1,
    maxSeconds: 31_536_000,
  },
  payloadLimit: process.env.MAX_PAYLOAD_BYTES || '10mb',
};

module.exports = config;
