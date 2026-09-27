import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
loadEnv({ path: '.env.local', quiet: true });

const env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(7331),
  PROCESS_ROLE: z.enum(['all','web','worker']).default('all'),
  AGENT_GLOBAL_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  AGENT_ACCOUNT_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  AGENT_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  AGENT_INTERACTIVE_SLOTS: z.coerce.number().int().min(1).max(64).default(1),
  APP_ORIGIN: z.url().default('https://dev.druggie.org'),
  UI_ORIGIN: z.string().default(''),
  MONGODB_URI: z.string().min(1, 'Set the cloud database connection. A local database is not used.'),
  MONGODB_POOL_SIZE: z.coerce.number().int().min(4).max(200).default(24),
  SEARCH_DAILY_BUDGET_NANOS: z.coerce.number().int().min(0).default(250000000),
  QDRANT_URL: z.string().default(''),
  QDRANT_API_KEY: z.string().default(''),
  SEARCH_NAMESPACE: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('newdrugs'),
  LIVE_MAX_CONNECTIONS:z.coerce.number().int().min(1).default(2048),
  DATA_DIR: z.string().default('.data/private'),
  MEDIA_STORAGE: z.enum(['local','s3']).default('local'),
  OBJECT_ENDPOINT: z.string().default(''),
  OBJECT_REGION: z.string().default('us-east-1'),
  OBJECT_BUCKET: z.string().default(''),
  OBJECT_ACCESS_KEY_ID: z.string().default(''),
  OBJECT_SECRET_ACCESS_KEY: z.string().default(''),
  OBJECT_PREFIX: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('newdrugs'),
  MCP_ORIGIN: z.string().default(''),
  DEV_ACCESS_KEY: z.string().default(''),
  SESSION_COOKIE: z.string().default('nd_session'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  STARTER_IP_HASH_KEY: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('https://druggie.org'),
  STARTER_POOL_DB: z.string().default('newdrugs_shared'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.enum(['gpt-6-luna']).default('gpt-6-luna'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_FEE_BPS: z.coerce.number().int().min(0).max(9999).default(290),
  STRIPE_FEE_FIXED_CENTS: z.coerce.number().int().min(0).max(10000).default(30),
}).parse(process.env);

export const config = {
  ...env,
  uiOrigin: env.UI_ORIGIN || (env.APP_ENV === 'staging' ? 'http://localhost:7330' : env.APP_ORIGIN),
  production: env.NODE_ENV === 'production',
  paymentsEnabled: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
  aiEnabled: Boolean(env.OPENAI_API_KEY),
};
if (config.production && !config.APP_ORIGIN.startsWith('https://')) {
  throw new Error('APP_ORIGIN must use HTTPS in production.');
}
if(config.MEDIA_STORAGE==='s3'&&(!config.OBJECT_ENDPOINT.startsWith('https://')||!config.OBJECT_BUCKET||!config.OBJECT_ACCESS_KEY_ID||!config.OBJECT_SECRET_ACCESS_KEY))throw Error('Private object storage configuration is incomplete.');
