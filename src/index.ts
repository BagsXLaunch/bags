import { env } from './app/env.js';
import { logger } from './app/logger.js';
import { prisma } from './app/db.js';
import { startServer } from './api/server.js';
import { startMentionPolling, stopMentionPolling } from './modules/mentions/mention.service.js';
import { processQueuedJobs } from './workers/process-launch-jobs.js';

const log = logger.child({ module: 'main' });

async function main() {
  log.info({ env: env.NODE_ENV, provider: env.LAUNCH_PROVIDER }, 'Starting BagsBot');

  // Verify DB connection
  try {
    await prisma.$connect();
    log.info('Database connected');
  } catch (error) {
    log.fatal({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  // Process any queued jobs from previous runs
  try {
    await processQueuedJobs();
  } catch (error) {
    log.error({ error }, 'Error processing queued jobs on startup');
  }

  // Start the admin/health API server
  await startServer();

  // Start mention polling
  startMentionPolling().catch((error) => {
    log.fatal({ error }, 'Mention polling crashed');
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down');
    stopMentionPolling();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  log.fatal({ error }, 'Unhandled error in main');
  process.exit(1);
});
