import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests live alongside the code they cover, not in a separate tests/ tree.
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    setupFiles: ['./apps/server/src/test/setup-env.ts'],
    // Each file gets its own in-memory database, so they must not share a
    // process-wide Sequelize singleton.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
});
