import { buildGeometryServer } from './server.js';

const port = Number(process.env.PORT ?? 7080);
const { app } = buildGeometryServer();
await app.listen({ port, host: '0.0.0.0' });
