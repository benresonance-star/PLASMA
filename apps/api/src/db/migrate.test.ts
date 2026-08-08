import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { migrate } from './migrate.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://spds:spds@localhost:5432/spds';

describe('G2.1 postgres migration', () => {
  it('applies schema to local postgres', async () => {
    try {
      await migrate(databaseUrl);
      const sql = postgres(databaseUrl, { max: 1 });
      try {
        const rows = await sql<{ table_name: string }[]>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'semantic_objects'
        `;
        expect(rows.length).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ECONNREFUSED') || message.includes('connect')) {
        console.warn('[migrate.test] Postgres unavailable — skipping');
        return;
      }
      throw err;
    }
  }, 30_000);
});
