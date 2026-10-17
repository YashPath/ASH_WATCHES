import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { closeRedisClients } from './middleware/security.js';
import { scheduleOrderMaintenance, closeOrderMaintenance } from './jobs/pending-order-cleanup.js';
import { scheduleSearchJobs, closeSearchQueue } from './search/queue.js';
import { closeEmailQueue } from './lib/email.js';

const server = app.listen(env.API_PORT, () => logger.info({ port: env.API_PORT }, 'ASH_ API listening'));
void scheduleOrderMaintenance().catch(error => logger.error({ err: error }, 'Could not schedule order maintenance jobs'));
void scheduleSearchJobs().catch(error => logger.error({ err: error }, 'Could not schedule search jobs'));
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  const timeout = setTimeout(() => { logger.error('Shutdown timed out'); process.exit(1); }, 15_000);
  timeout.unref();
  server.close(async error => {
    try {
      await closeOrderMaintenance();
      await closeSearchQueue();
      await closeEmailQueue();
      await prisma.$disconnect();
      await closeRedisClients();
    } catch (disconnectError) { logger.error({ err: disconnectError }, 'Shutdown cleanup failed'); }
    clearTimeout(timeout);
    if (error) { logger.error({ err: error }, 'HTTP server shutdown failed'); process.exitCode = 1; }
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
