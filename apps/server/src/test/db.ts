import { Sequelize } from 'sequelize';

import { setSequelize } from '../db/sequelize';
import { initModels, resetModelRegistration } from '../models';
import { resetBroadcaster } from '../realtime/broadcaster';

/**
 * Fresh in-memory database per test file.
 *
 * SQLite rather than Postgres so the suite runs with no external service —
 * these tests cover application logic (authorization, validation, ordering),
 * not Postgres-specific behaviour. Anything that depends on pgvector in Stage E
 * will need a real Postgres and belongs in a separate integration suite.
 */
export async function createTestDatabase(): Promise<Sequelize> {
  // Dialect + storage rather than a `sqlite::memory:` URL, which Node now
  // warns about as an invalid URL.
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  resetModelRegistration();
  resetBroadcaster();
  setSequelize(sequelize);
  initModels(sequelize);

  await sequelize.sync({ force: true });
  return sequelize;
}
