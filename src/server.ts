import { env } from './config/env.js';
import { buildApp } from './app.js';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
// Crash loudly (and let the orchestrator restart us) instead of running in an unknown state.
process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
