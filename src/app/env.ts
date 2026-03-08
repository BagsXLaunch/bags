import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),

  // X API
  X_API_KEY: z.string().default(''),
  X_API_SECRET: z.string().default(''),
  X_ACCESS_TOKEN: z.string().default(''),
  X_ACCESS_SECRET: z.string().default(''),
  X_BEARER_TOKEN: z.string().default(''),

  // Bot
  BOT_USERNAME: z.string().default('LaunchOnBags'),
  POLL_INTERVAL_MS: z.coerce.number().default(15000),

  // Launch provider
  LAUNCH_PROVIDER: z.enum(['mock', 'bags']).default('mock'),

  // Bags API / Solana
  BAGS_API_KEY: z.string().default(''),
  SOLANA_RPC_URL: z.string().default('https://api.mainnet-beta.solana.com'),
  PRIVATE_KEY: z.string().default(''),

  // Reply
  ENABLE_REPLY_POSTING: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  DEFAULT_REPLY_MODE: z.enum(['public', 'dry_run']).default('public'),

  // Rate limiting
  RATE_LIMIT_PER_USER_PER_DAY: z.coerce.number().default(5),

  // Allowlist
  ALLOWLIST_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
