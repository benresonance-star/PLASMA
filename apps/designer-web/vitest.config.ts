import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@spds/graph-projection': path.resolve(
        rootDir,
        '../../packages/graph-projection/src/index.ts',
      ),
      '@spds/ai-interface': path.resolve(rootDir, '../../packages/ai-interface/src/index.ts'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
