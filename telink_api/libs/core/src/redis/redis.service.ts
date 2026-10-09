import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from '../config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client!: Redis;
  private warned = false;

  constructor(private readonly config: ConfigService) {}

  get client(): Redis {
    return this._client;
  }

  async onModuleInit() {
    const redis = this.config.get<RedisConfig>('root.redis');
    if (!redis) {
      this.logger.warn('Missing redis config; skipping Redis client');
      return;
    }

    const clientOptions = {
      retryStrategy: (times: number) => {
        if (times > 5) {
          if (!this.warned) {
            this.logger.warn(
              'Redis unreachable after 5 retries — API continues without cache.',
            );
            this.warned = true;
          }
          return null;
        }
        return Math.min(times * 100, 1000);
      },
      maxRetriesPerRequest: 3,
    };

    if (redis.url) {
      this._client = new Redis(redis.url, clientOptions);
    } else {
      this._client = new Redis({
        host: redis.host,
        port: redis.port,
        password: redis.password,
        db: redis.db,
        ...clientOptions,
      });
    }

    this._client.on('error', (err) => {
      if (!this.warned) {
        this.logger.warn(`Redis error: ${err.message}`);
        this.warned = true;
      }
    });
    this._client.on('connect', () => {
      this.warned = false;
      this.logger.log('Redis connected');
    });
    this._client.on('ready', () => {
      this.warned = false;
      this.logger.log('Redis ready');
    });
  }

  async onModuleDestroy() {
    if (this._client) {
      await this._client.quit().catch(() => undefined);
    }
  }
}