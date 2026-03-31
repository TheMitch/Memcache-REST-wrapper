const config = require('./config');
const app = require('./app');
const redis = require('./storage/redisClient');

const start = () => {
  const server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });

  const connectRedis = async () => {
    try {
      await redis.connect();
    } catch (err) {
      console.error('Failed to connect to Redis', err);
    }
  };
  void connectRedis();

  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    try {
      await redis.quit();
    } catch (err) {
      console.error('Failed to quit Redis cleanly', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start();
