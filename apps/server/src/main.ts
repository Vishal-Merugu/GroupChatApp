import { createServer } from 'node:http';
import path from 'node:path';

import { createApp } from './app';
import { getEnv } from './config/env';
import { getSequelize } from './db/sequelize';
import { initModels } from './models';
import { createGateway } from './realtime/gateway';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const env = getEnv();

  const sequelize = getSequelize();
  initModels(sequelize);

  await sequelize.authenticate();
  logger.info('Database connected', { host: env.DB_HOST, database: env.DB_NAME });

  // Schema is applied straight from the models. There is no production data
  // yet, so a model change lands on the database on the next restart with no
  // migration step in between. Revisit once there is data worth preserving —
  // `alter` will happily drop a column you renamed.
  if (env.DB_SYNC) {
    await sequelize.sync({ alter: true });
    logger.info('Schema synced from models');
  }

  // In production the API also serves the built client from apps/web/dist.
  const app = createApp({
    corsOrigin: env.APP_BASE_URL,
    webRoot: path.resolve(__dirname, '../../web/dist'),
  });
  const httpServer = createServer(app);
  createGateway(httpServer, env.APP_BASE_URL);

  httpServer.listen(env.PORT, () => {
    logger.info('Server listening', { port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = (signal: string): void => {
    logger.info('Shutting down', { signal });
    httpServer.close(() => {
      void sequelize.close().then(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error('Failed to start server', { error: String(error) });
  process.exit(1);
});
