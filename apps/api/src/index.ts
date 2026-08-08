import { buildServer } from './server.js';

export { buildServer };

const port = Number(process.env.PORT ?? 3001);

if (process.env.SPDS_API_LISTEN === '1') {
  const { app } = buildServer();
  await app.listen({ port, host: '0.0.0.0' });
}
