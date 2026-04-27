const Redis  = require('ioredis');
const logger = require('../utils/logger.util');

let redisClient    = null;
let redisAvailable = false;

const initRedis = () => {
  // Support both REDIS_URL (Render/PaaS connection string) and individual vars
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
  if (!redisUrl) {
    logger.info('Redis not configured — caching disabled');
    return null;
  }

  const config = process.env.REDIS_URL
    ? {
        lazyConnect:        true,
        enableOfflineQueue: false,
        tls:                process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
        retryStrategy: (times) => {
          if (times > 3) { redisAvailable = false; return null; }
          return Math.min(times * 200, 3000);
        },
      }
    : {
        host:               process.env.REDIS_HOST || 'localhost',
        port:               parseInt(process.env.REDIS_PORT) || 6379,
        password:           process.env.REDIS_PASSWORD || undefined,
        lazyConnect:        true,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 3) { redisAvailable = false; return null; }
          return Math.min(times * 200, 3000);
        },
      };

  // ioredis accepts a URL string as first arg when REDIS_URL is set
  const client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, config)
    : new Redis(config);

  client.on('connect', () => { redisAvailable = true;  logger.info('Redis connected'); });
  client.on('error',   () => { redisAvailable = false; });

  client.connect().catch(() => {
    redisAvailable = false;
    logger.warn('Redis connection failed — running without cache');
  });

  return client;
};

redisClient = initRedis();

const getRedis         = () => redisClient;
const isRedisAvailable = () => redisAvailable;

module.exports = { getRedis, isRedisAvailable };
