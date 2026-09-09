/**
 * Per-user UI preferences — Postgres when DATABASE_URL is set, else in-memory.
 */
import postgres, { type Sql } from 'postgres';

export const UI_PREFERENCES_SCHEMA_VERSION = '1';

export type UiPreferencesPayload = Record<string, unknown>;

export interface UiPreferencesRecord {
  readonly userId: string;
  readonly payload: UiPreferencesPayload;
  readonly schemaVersion: string;
  readonly updatedAt: string;
}

export interface UiPreferencesStore {
  get(userId: string): Promise<UiPreferencesRecord | null>;
  put(
    userId: string,
    payload: UiPreferencesPayload,
    schemaVersion?: string,
  ): Promise<UiPreferencesRecord>;
  close?(): Promise<void>;
}

function asIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export class InMemoryUiPreferencesStore implements UiPreferencesStore {
  private readonly rows = new Map<string, UiPreferencesRecord>();

  async get(userId: string): Promise<UiPreferencesRecord | null> {
    return this.rows.get(userId) ?? null;
  }

  async put(
    userId: string,
    payload: UiPreferencesPayload,
    schemaVersion = UI_PREFERENCES_SCHEMA_VERSION,
  ): Promise<UiPreferencesRecord> {
    const row: UiPreferencesRecord = {
      userId,
      payload: { ...payload },
      schemaVersion,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(userId, row);
    return row;
  }
}

type UiPrefRow = {
  user_id: string;
  payload: UiPreferencesPayload;
  schema_version: string;
  updated_at: Date | string;
};

export class PostgresUiPreferencesStore implements UiPreferencesStore {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 2 });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async get(userId: string): Promise<UiPreferencesRecord | null> {
    const rows = await this.sql<UiPrefRow[]>`
      SELECT user_id, payload, schema_version, updated_at
      FROM user_ui_preferences
      WHERE user_id = ${userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      payload: (row.payload ?? {}) as UiPreferencesPayload,
      schemaVersion: row.schema_version,
      updatedAt: asIso(row.updated_at),
    };
  }

  async put(
    userId: string,
    payload: UiPreferencesPayload,
    schemaVersion = UI_PREFERENCES_SCHEMA_VERSION,
  ): Promise<UiPreferencesRecord> {
    const rows = await this.sql<UiPrefRow[]>`
      INSERT INTO user_ui_preferences (user_id, payload, schema_version, updated_at)
      VALUES (
        ${userId},
        ${JSON.stringify(payload)}::jsonb,
        ${schemaVersion},
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        schema_version = EXCLUDED.schema_version,
        updated_at = now()
      RETURNING user_id, payload, schema_version, updated_at
    `;
    const row = rows[0]!;
    return {
      userId: row.user_id,
      payload: (row.payload ?? {}) as UiPreferencesPayload,
      schemaVersion: row.schema_version,
      updatedAt: asIso(row.updated_at),
    };
  }
}

export function createUiPreferencesStoreFromEnv(): {
  store: UiPreferencesStore;
  kind: 'memory' | 'postgres';
  close?: () => Promise<void>;
} {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return { store: new InMemoryUiPreferencesStore(), kind: 'memory' };
  }
  const store = new PostgresUiPreferencesStore(url);
  return {
    store,
    kind: 'postgres',
    close: () => store.close(),
  };
}
