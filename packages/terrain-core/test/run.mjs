import * as mapping from "../src/common-contracts.mjs";
import * as presentation from "../src/presentation-consumer.mjs";
import { runPresentationTests } from "./presentation-cases.mjs";
import * as core from "../src/index.mjs";
import * as surface from "../src/surface.mjs";
import * as bridge from "../src/bridge.mjs";
import * as client from "../src/worker-client.mjs";
import { runTerrainTests } from "./cases.mjs";
import { runSurfaceTests } from "./surface-cases.mjs";
import { runBridgeTests } from "./bridge-cases.mjs";

const results = [...runTerrainTests(core), ...runSurfaceTests(core, surface),
  ...await runBridgeTests(core, surface, bridge, client),
  ...runPresentationTests(core, surface, mapping, presentation)];
for (const result of results) {
  console.log(result.status === "pass" ? "PASS" : "FAIL", result.name);
  if (result.error) console.error(result.error);
}
const failures = results.filter(result => result.status !== "pass");
console.log(results.length - failures.length + "/" + results.length + " passed");
if (failures.length) process.exitCode = 1;
