import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Keep the compile-mapper timing budget independent of other file workers.
  test: { environment: 'node', include: ['src/**/*.test.ts'], fileParallelism: false },
});
