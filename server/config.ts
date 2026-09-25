import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
loadEnv({ path: '.env.local', quiet: true });

const env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(7331),
  APP_ORIGIN: z.url().default('https://dev.druggie.org'),
  UI_ORIGIN: z.string().default(''),
  MONGODB_URI: z.string().min(1, 'Set the cloud database connection. A local database is not used.'),
  SEARCH_DAILY_BUDGET_NANOS: z.coerce.number().int().min(0).default(250000000),
  DATA_DIR: z.string().default('.data/private'),
  MCP_ORIGIN: z.string().default(''),
  DEV_ACCESS_KEY: z.string().default(''),
  SESSION_COOKIE: z.string().default('nd_session'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
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
