import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  appName: string;
  appPort: number;
  appUrl: string;
  appCorsOrigins: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  url?: string;
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface RootConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
}

const opt = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
};

const csv = (name: string): string[] => {
  const v = opt(name);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
};

export const rootConfig = registerAs('root', (): RootConfig => ({
  app: {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    appName: process.env.APP_NAME ?? 'telink-api',
    appPort: parseInt(process.env.APP_PORT ?? '3000', 10),
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    appCorsOrigins: csv('APP_CORS_ORIGINS'),
  },
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://telink:telink@localhost:5432/telink',
  },
  redis: {
    url: opt('REDIS_URL'),
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: opt('REDIS_PASSWORD'),
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },
}));