import { createGeometryKernel } from './kernel-factory.js';
import { OcctNativeKernel } from './occt-native-kernel.js';
import { buildGeometryServer } from './server.js';

const port = Number(process.env.PORT ?? 7080);
const kernel = createGeometryKernel();
if (kernel instanceof OcctNativeKernel) {
  await kernel.ensureReady();
}
const { app } = buildGeometryServer(kernel);
await app.listen({ port, host: '0.0.0.0' });
