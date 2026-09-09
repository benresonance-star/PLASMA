import { buildServer } from './server.js';
import { migrate } from './db/migrate.js';
import { createVersionStoreFromEnv } from './db/postgres-version-store.js';
import { createUiPreferencesStoreFromEnv } from './db/ui-preferences-store.js';

export { buildServer };

const port = Number(process.env.PORT ?? 3001);

if (process.env.SPDS_API_LISTEN === '1') {
  if (process.env.DATABASE_URL) {
    await migrate(process.env.DATABASE_URL);
  }
  const { store, close } = await createVersionStoreFromEnv();
  const uiPrefs = createUiPreferencesStoreFromEnv();
  const { app } = buildServer(store, { uiPreferences: uiPrefs.store });
  await app.listen({ port, host: '0.0.0.0' });
  // store kind selected via DATABASE_URL (postgres) or memory default
  const shutdown = async () => {
    await app.close();
    if (close) await close();
    if (uiPrefs.close) await uiPrefs.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
