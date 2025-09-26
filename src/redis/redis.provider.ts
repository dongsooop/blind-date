import 'dotenv/config';
import { createClient, RedisClientType } from 'redis';

export const createRedisProvider = async (): Promise<RedisClientType> => {
  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
    password: process.env.REDIS_PASSWORD,
  }) as RedisClientType;

  await client.connect();
  return client;
};
