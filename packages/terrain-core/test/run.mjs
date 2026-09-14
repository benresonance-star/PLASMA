import * as core from "../src/index.mjs";
import * as surface from "../src/surface.mjs";
import { runTerrainTests } from "./cases.mjs";
import { runSurfaceTests } from "./surface-cases.mjs";

const results = [...runTerrainTests(core), ...runSurfaceTests(core, surface)];
for (const result of results) {
  console.log(result.status === "pass" ? "PASS" : "FAIL", result.name);
  if (result.error) console.error(result.error);
}
const failures = results.filter(result => result.status !== "pass");
console.log(results.length - failures.length + "/" + results.length + " passed");
if (failures.length) process.exitCode = 1;
