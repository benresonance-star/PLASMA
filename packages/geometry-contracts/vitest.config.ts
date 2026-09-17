import { defineConfig } from 'vitest/config';

export default defineConfig({
  // These suites contain wall-clock budgets; concurrent file workers distort them.
  test: { environment: 'node', include: ['src/**/*.test.ts'], fileParallelism: false },
});
