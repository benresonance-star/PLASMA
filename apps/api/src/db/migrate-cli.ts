import { migrate } from './migrate.js';

const url = process.env.DATABASE_URL ?? 'postgres://spds:spds@localhost:5432/spds';
await migrate(url);
console.log('[migrate] OK');
