// Run the localhost demo server first. Uses an installed agent-browser CLI.
// Example: node packages/terrain-core/test/browser-smoke.mjs /path/to/agent-browser
import { execFileSync } from "node:child_process";
import { openSync, closeSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const cli = process.argv[2] ?? "agent-browser", session = "plasma-smoke-" + process.pid;
const results = [];
const commandDirectory = mkdtempSync(join(tmpdir(), "plasma-browser-"));
let commandNumber = 0;
function run(...args) {
  // On Windows, a newly launched daemon inherits pipe handles. Files let the
  // short-lived CLI exit without waiting for that daemon to close stdout.
  const path = join(commandDirectory, String(++commandNumber) + ".json"), fd = openSync(path, "w");
  try { execFileSync(cli, ["--session", session, "--json", ...args],
    { stdio: ["ignore", fd, fd], windowsHide: true, timeout: 15000 }); } finally { closeSync(fd); }
  const output = readFileSync(path, "utf8");
  const response = JSON.parse(output.trim().split("\n").findLast(line => line.startsWith("{")));
  if (!response.success) throw Error(JSON.stringify(response.error));
  return response.data;
}
const evaluate = code => JSON.parse(run("eval", "JSON.stringify(" + code + ")").result);
const state = () => evaluate(`({ lifecycle: document.getElementById('view').dataset.lifecycle,
  currentness: document.getElementById('view').dataset.currentness,
  sequence: Number(document.getElementById('view').dataset.inputSequence),
  status: document.getElementById('status').textContent, level: document.getElementById('level').value,
  selected: document.getElementById('point').value,
  ghost: !!document.querySelector('[data-reflex-ghost]'),
  groups: document.querySelectorAll('[data-plasma-surface]').length })`);
const position = () => evaluate(`(() => {const circle=document.querySelector('[data-selected=true] circle');
  const p=document.getElementById('view').createSVGPoint();p.x=Number(circle.getAttribute('cx'));p.y=Number(circle.getAttribute('cy'));
  const q=p.matrixTransform(circle.getScreenCTM());return {x:q.x,y:q.y};})()`);
const mesh = () => evaluate(`Array.from(document.querySelector('[aria-label="accepted terrain preview"]').querySelectorAll('polygon')).map(p=>p.getAttribute('points'))`);
async function until(predicate) {
  const deadline = Date.now() + 10000;
  do { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } while (Date.now() < deadline);
  throw Error("Browser condition timed out: " + JSON.stringify(state()));
}
async function check(name, fn) { await fn(); results.push({ name, status: "pass" }); console.log("PASS", name); }
function begin(p) { run("mouse", "move", String(Math.round(p.x)), String(Math.round(p.y))); run("mouse", "down"); }
function move(p, dx, dy) { run("mouse", "move", String(Math.round(p.x + dx)), String(Math.round(p.y + dy))); }
try {
  run("open", "http://127.0.0.1:8080/packages/terrain-core/demo/");
  run("set", "viewport", "1280", "900");
  await until(() => evaluate("document.querySelectorAll('[data-selected]').length") === 25);
  const originalMesh = mesh(), original = position();
  await check("native module worker loads and renders 25 controls", () => assert.equal(state().groups, 1));
  let moved;
  await check("pointer drag survives redraw, resolves on release and preserves Z", async () => {
    begin(original); move(original, 35, -15);
    assert.equal(state().lifecycle, "active"); assert.equal(state().ghost, true);
    move(original, 45, -20); run("mouse", "up");
    await until(() => state().lifecycle === "awaiting_acceptance");
    assert.equal(state().currentness, "current"); assert.equal(state().level, "100460");
    moved = position(); assert.ok(moved.x - original.x > 40); assert.deepEqual(mesh(), originalMesh);
  });
  await check("Escape during a second drag restores the previous candidate", () => {
    begin(moved); move(moved, 30, 20); run("press", "Escape"); run("mouse", "up");
    assert.equal(state().lifecycle, "cancelled"); assert.equal(state().ghost, false);
    assert.ok(Math.abs(position().x - moved.x) < 1);
  });
  await check("pointercancel clears the gesture and its late worker output", async () => {
    evaluate(`document.getElementById('view').addEventListener('pointerdown', e=>window.testPointerId=e.pointerId, {once:true}) || true`);
    begin(moved); move(moved, 20, 15);
    evaluate(`document.getElementById('view').dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.testPointerId,clientX:0,clientY:0}))`);
    run("mouse", "up"); await until(() => state().lifecycle === "cancelled");
    assert.equal(state().ghost, false); assert.ok(Math.abs(position().x - moved.x) < 1);
  });
  await check("view changes cancel active manipulation before changing projection", () => {
    begin(moved); move(moved, 10, 10);
    evaluate("document.getElementById('axon').click() || true"); run("mouse", "up");
    assert.equal(state().lifecycle, "cancelled"); assert.equal(state().ghost, false);
    run("click", "#plan"); assert.ok(Math.abs(position().x - moved.x) < 1);
  });
  await check("invalid control position remains a failed temporary preview", async () => {
    begin(moved); move(moved, 400, 0); run("mouse", "up");
    await until(() => state().lifecycle === "failed");
    assert.equal(state().currentness, "unavailable"); assert.deepEqual(mesh(), originalMesh);
    run("click", "#cancel"); assert.ok(Math.abs(position().x - moved.x) < 1);
  });
  await check("keyboard selection and numeric elevation preview still work", async () => {
    run("focus", '[aria-label="p6 · level 100230 millimetres"]'); run("press", "Enter");
    assert.equal(state().selected, "p6"); run("fill", "#level", "100730"); run("click", "#preview");
    await until(() => state().level === "100730" && evaluate("!document.getElementById('preview').disabled"));
    assert.deepEqual(mesh(), originalMesh);
  });
  await check("reset restores original fixture and removes transient visuals", () => {
    run("click", "#reset"); assert.equal(state().level, "100230"); assert.equal(state().ghost, false);
    assert.equal(state().groups, 1); assert.deepEqual(mesh(), originalMesh);
  });
  await check("phone-sized layout fits without horizontal overflow", () => {
    run("set", "viewport", "390", "844");
    assert.ok(evaluate("document.documentElement.scrollWidth <= innerWidth"));
    assert.equal(evaluate("document.querySelectorAll('[data-selected]').length"), 25);
  });
  await check("no uncaught page errors", () => assert.deepEqual(run("errors").errors ?? [], []));
  run("set", "viewport", "1280", "900"); run("select", "#point", "p12");
  run("screenshot", "tmp/plasma-verified.png");
  const sources = ["demo/app.mjs", "demo/digest.mjs", "src/interaction-adapter.mjs", "src/svg-terrain.mjs", "src/presentation-consumer.mjs",
    "../interaction-reflex/src/session.mjs"];
  const sourceDigests = {};
  for (const path of sources) sourceDigests[path] = createHash("sha256").update(await readFile(new URL("../" + path, import.meta.url))).digest("hex");
  await writeFile(new URL("../evidence/interaction-browser-tests.json", import.meta.url), JSON.stringify({
    executedAt: new Date().toISOString(), browser: evaluate("navigator.userAgent"), sourceDigests, results,
    limits: ["Desktop Chrome automation; phone viewport emulation only", "No physical touch/pen, frame-latency or production-persistence qualification"] }, null, 2) + "\n");
} finally { run("close"); }
