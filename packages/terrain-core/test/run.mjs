import * as api from "../src/index.mjs";
import { runTerrainTests } from "./cases.mjs";

const results = runTerrainTests(api);
for (const result of results) {
  console.log(result.status === "pass" ? "PASS" : "FAIL", result.name);
  if (result.error) console.error(result.error);
}
const failures = results.filter(result => result.status !== "pass");
console.log(results.length - failures.length + "/" + results.length + " passed");
if (failures.length) process.exitCode = 1;
