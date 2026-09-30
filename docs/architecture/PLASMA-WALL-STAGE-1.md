# Plasma wall stage 1

This stage turns PLS-WALL-01 into an editable analytical feature slice. A user can create a two-layer straight or connected polyline wall, preview numeric edits, place one centred or fixed-jamb rectangular opening, then explicitly accept or discard the candidate. The feature, its derived outputs and operation lineage commit through the existing `TransactionEngine` and `VersionStore` in one command and one mutation.

The implementation is experimental. Accepted **feature parameters** do not imply accepted exact geometry, regulatory compliance or permission to issue construction documents. Every generated output carries `fidelity: analytical-preview` and `issueReady: false`.

## Run

Use Node 22 or newer and the repository-pinned pnpm 9.15.9.

```sh
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@spds/api... --filter=@spds/designer-web...
SPDS_API_LISTEN=1 node apps/api/dist/index.js
```

In a second terminal:

```sh
pnpm --filter @spds/designer-web dev
```

Open `http://127.0.0.1:5173/?stage=walls`, or follow **Wall study** in the designer header. Start a study, choose a path, review the preview, then **Accept feature**. Each numeric edit or opening edit requires another preview and acceptance. To cancel, use **Discard**. On a stale-head conflict, use **Reload accepted state**, then preview again.

The browser stores only the model/branch reference. The server's configured version store owns the model. With the default in-memory store, refresh/reopen works while the server remains running; a server restart loses that study. Existing PostgreSQL configuration enables server persistence, but this stage has **not** verified PostgreSQL restart recovery or corrupt/interrupted persistence. No durable-recovery gate is marked passed.

## Implemented scope

| Capability | Stage-one behaviour | Remaining acceptance work |
| --- | --- | --- |
| Wall parameters | Millimetres, world XY path with Z up, base elevation, height, reference face/centre, lateral offset, stable segment/layer IDs | Core-specific reference roles and broader system packs |
| Layers | Ordered material pins, thickness and explicit vertical extents; total thickness derived | Construction rules and certified material/system performance |
| Paths | Straight and connected polyline; numeric terminal length, typed stretch/move/reverse | Pointer-drawn paths and junction-aware topology edits |
| Openings | One rectangular opening, centred or anchored to a named end jamb; stable host identity through edits/reversal | Multiple openings, split/delete host disposition, window/door products |
| Candidate acceptance | Preview isolation, discard, scoped model/branch, stale-head rejection; one compound command for wall, outputs and operation lineage | Exact provider and persistent junction failure acceptance |
| Derived output | Layer footprints, elevation, rectangular prism pieces, gross/net layer volumes and opening deductions | Exact boundary representation, section/issued drawings, cost rates and junction overlap allocation |
| Branches and reopen | Independent version-store branches; deterministic regeneration after normal-origin page reload | Adoption/undo UI, durable recovery and external round trips |
| Atlas evidence | Narrow stage-one supporting evidence with source/test/CI bindings | Eight full WALL-AT gates remain required and unlinked |

For polyline walls, segment prisms are deliberately unjoined. Quantities are the **sum of unjoined segment volumes** and explicitly warn that junction allocation is unresolved. They must not be used as net construction quantities. No automatic material fusion or construction-policy choice occurs.

## Domain and API

`@spds/wall-core` defines strict schemas, typed `CreateWall`, `SetWallParameters`, `StretchWall`, `MoveWall`, `ReverseWall`, `HostOpening` and `RemoveOpening` operations, geometric integrity validation and deterministic analytical output derivation. Unsupported fields (including a total-thickness write), conflicting layer writers, unsupported system pins, degenerate/crossing paths and invalid/orphaned openings are rejected.

`apps/api/src/wall-routes.ts` registers:

| Endpoint | Purpose |
| --- | --- |
| `GET /walls/systems` | Experimental version-pinned system inventory |
| `GET /walls?modelId=…&branchId=…` | Accepted walls and deterministic current outputs |
| `POST /walls/preview` | `{modelId, branchId, expectedHeadHash, operation}` → isolated candidate |
| `POST /walls/previews/:id/commit` | `{modelId, branchId}` → gated feature acceptance |
| `POST /walls/previews/:id/discard` | `{modelId, branchId}` → discard candidate |

Each accepted output records a feature revision, source hash, producer/version, fidelity and tolerance. An accepted operation record preserves the typed operation, base revision, transaction, actor and result source hash. Reopening reconstructs outputs from accepted parameters; it does not trust stored geometry to become authoritative. Stale candidates cannot overwrite the current branch head. Preview handles are process-local; a lost handle requires a fresh preview. If a commit response is lost, reload accepted state before retrying.

## Verification

```sh
pnpm --filter @spds/wall-core test
pnpm --filter @spds/api exec vitest run src/wall-routes.test.ts
pnpm --filter @spds/transaction-core test
pnpm --filter @spds/version-core test
node tooling/boundary-check/check.mjs
node apps/system-atlas-preview/atlas-validate.mjs
```

For browser checks, keep the API and Vite servers running. Install Playwright outside the workspace:

```sh
npm install --prefix /tmp/plasma-wall-browser playwright@1.55.0
/tmp/plasma-wall-browser/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/plasma-wall-browser/node_modules/playwright/index.mjs node scripts/wall-browser-smoke.mjs
```

The browser suite tests desktop/mobile creation, preview isolation, discard, acceptance, numerical edits, hosted identity, fixed-jamb reversal, invalid openings, competing edits, normal-origin reload, mobile scrolling and polyline editing. `WALL_PREVIEW_URL`, `WALL_SCREENSHOTS` and `CHROMIUM_PATH` are optional overrides.

The separate `wall-stage1` workflow repeats the browser flow. `atlas-evidence` binds the narrower domain/API test step to **ev-wall-stage1**. A local pass is supporting evidence, not a fabricated CI run or a full WALL-AT gate pass.

## Next increment

Connect candidate prisms/opening cuts to the assigned exact geometry provider with declared tolerance and failure results, then implement a persistent two-wall junction policy. Keep exact-result freshness tied to the base revision and feature source hash. Only after those failures and overlap-allocation cases pass should room-boundary propagation and issued quantities be enabled.

## Local validation record

- 11 wall-domain tests and 7 wall API tests passed. The existing transaction and version-store suites also passed (5 tests).
- API and designer production builds, frozen pnpm 9.15.9 install, changed-source lint, boundary check, Atlas model and both JSON Schemas passed.
- Desktop/mobile browser smoke passed after the final lineage and scrolling changes, with no page runtime errors.
- Wider API regression: 69 passed, 1 skipped; the database migration test could not connect to local PostgreSQL.
- Wider designer regression: 153 passed, 2 failed. An existing React Flow class-mapping assertion fails consistently in untouched code. The existing sub-millisecond documentation lookup assertion failed under parallel suite load but passed when rerun in isolation. These are not wall-stage evidence passes.
- Full wall acceptance remains incomplete. No exact-provider, junction, room, issue-document or durable-recovery gate is closed by this stage.
