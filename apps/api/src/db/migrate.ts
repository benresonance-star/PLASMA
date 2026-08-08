import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    const schemaPath = path.join(here, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await sql.unsafe(schema);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
