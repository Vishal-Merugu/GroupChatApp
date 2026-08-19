import { Sequelize } from 'sequelize';

import { getEnv } from '../config/env';
import { logger } from '../utils/logger';

let instance: Sequelize | undefined;

/**
 * Postgres rather than the original MySQL — Decision 2 puts the vector index in
 * the same database as everything else via pgvector, which MySQL cannot do.
 */
export function getSequelize(): Sequelize {
  if (instance) {
    return instance;
  }

  const env = getEnv();
  instance = new Sequelize(env.DB_NAME, env.DB_USERNAME, env.DB_PASSWORD, {
    dialect: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    logging: env.NODE_ENV === 'development' ? (sql: string) => logger.debug(sql) : false,
    ...(env.DB_SSL
      ? {
          dialectOptions: {
            // Managed providers terminate TLS with their own CA, which the
            // container does not carry.
            ssl: { require: true, rejectUnauthorized: false },
          },
        }
      : {}),
    define: {
      // Explicit: the AI layer will join across these tables constantly, and
      // implicit snake_case conversion makes those queries harder to follow.
      underscored: false,
    },
  });

  return instance;
}

/** Test helper — lets a suite supply an in-memory or throwaway connection. */
export function setSequelize(sequelize: Sequelize): void {
  instance = sequelize;
}
