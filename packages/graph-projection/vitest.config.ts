import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Wall-clock scale budgets must not compete with other file workers.
    fileParallelism: false,
  },
});
