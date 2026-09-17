import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { migrate } from './migrate.js';

const databaseUrl = process.env.DATABASE_URL;

// CI provides a disposable database. Local runs explicitly report a skip when
// none is configured; a configured database must pass without swallowed errors.
describe.skipIf(!databaseUrl)('G2.1 postgres migration', () => {
  it('applies schema to local postgres', async () => {
    await migrate(databaseUrl!);
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const rows = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'semantic_objects'
      `;
      expect(rows.length).toBe(1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 30_000);
});
