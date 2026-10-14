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
      // CI provisions PostgreSQL and MUST exercise migration correctness.
      // On local machines without Postgres, only known connection failures
      // are optional; never silently ignore schema/permission/SQL errors.
      if (process.env.SPDS_REQUIRE_POSTGRES === '1') throw err;
      const failures = err instanceof AggregateError ? err.errors : [err];
      const unavailable = failures.some((failure: unknown) =>
        failure !== null &&
        typeof failure === 'object' &&
        'code' in failure &&
        ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT'].includes(
          String((failure as { code?: unknown }).code),
        ),
      );
      if (unavailable) {
        console.warn('[migrate.test] Local Postgres unavailable — skipping optional integration check');
        return;
      }
      throw err;
    }
  }, 30_000);
});
