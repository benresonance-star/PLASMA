# Terrain interaction preview

From the repository root, with Node 22 or newer:

```sh
node packages/terrain-core/demo/serve.mjs
```

Open [the localhost preview](http://127.0.0.1:8080/packages/terrain-core/demo/).
The server binds only to localhost and serves the repository so the sibling
interaction-reflex package can load. No npm installation is required for the demo.
An equivalent static server must serve the repository root, not just terrain-core.

## Try it

1. In Plan, drag the orange `p12` control. XY changes; elevation stays fixed.
2. The dashed ghost and control move immediately. A worker independently rebuilds
   the terrain. Only a result for the current session/revision/sequence/digest can
   enter the current presentation.
3. Release to retain a temporary candidate. This is awaiting acceptance, not an
   accepted project edit. The original fixture remains visible underneath.
4. Escape, Cancel drag or pointer cancellation restores the preview from before
   that gesture. Reset preview restores the original fixture.
5. Enter/Space selects a focused control; the selector and numeric level preview
   remain available. Axonometric is a fixed projected diagram for inspection.

Switching views or resizing the window cancels an active gesture before changing
its projection. A completed candidate can be the starting point for another drag;
each session pins that source independently. An invalid move stays visibly
unavailable/failed and can be corrected or cancelled. No constraint snapping is
implied. The fixture has 25 controls and 32 triangles.

## Contract boundary

`PresentationInput` -> domain-neutral `createInteractionSession` ->
`InteractionOverlay` -> `PresentationFrame` -> SVG feedback, with an independent
`PreviewRequest` -> terrain bridge -> module worker -> `PreviewResponse` path.
Terrain mesh artifacts also receive the existing `RepresentationResponse` mapping.

The SVG sink emits frame-bound observations in viewBox coordinates. The domain
adapter owns the pinned XY conversion, `point.replace` delta and bridge request.
Stable semantic references identify controls across replacement meshes. Root SVG
pointer capture survives replacement of the rendered child groups. The consumer
still checks exact current frame/hit-map bindings before emitting input.

The runtime retains one active and one latest pending request, rejects obsolete
results, and releases superseded delta/artifact references. The demo additionally
bounds transport work across cancelled/replaced sessions. Artifact reference
counts preserve the initial fixture and the prior candidate while a gesture runs.
These registries are a temporary harness, not a durable World State host.

Topology validation supports `locally_valid` interaction assessment; requested
representation tolerances remain `unknown`. The synchronous operation digest is
bounded to 8 KiB and tested against native SHA-256. Mesh/source hashing uses Web
Crypto outside the reflex path. No evaluator or transaction port is passed to SVG.

## Verification

```sh
node packages/terrain-core/test/run.mjs
node --test packages/terrain-core/test/interaction.test.mjs
node --test packages/interaction-reflex/test/session.test.mjs
```

The existing 70 cases and 17 new cases passed natively in Node 25.2.1 on Windows.
With the server running and agent-browser installed, reproduce browser checks:

```sh
node packages/terrain-core/test/browser-smoke.mjs /path/to/agent-browser
```

On Windows, supply the native agent-browser executable path. Set
`AGENT_BROWSER_EXECUTABLE_PATH` to the installed Chrome executable if needed.
The script creates and closes its own browser session and records source digests
and results in `../evidence/interaction-browser-tests.json`. Ten Chrome checks pass,
including real module Worker loading, native mouse dragging, Escape, a synthesized
pointercancel event, invalid movement, view switching, keyboard/numeric controls,
reset, phone-width layout and uncaught page errors.

## Limits

This is local, uncommitted fixture preview. No project commit, persistence, undo,
production host, Rive, 3D picking, snapping or imported survey is implemented here.
Phone-width emulation does not qualify physical touch/pen input. Physical latency,
frame rate, full accessibility and monorepo-wide build gates are not qualified by
these checks. No Sites deployment has been performed.

## Optional saved mode
Run `node packages/world-runtime/demo/server.mjs` from the repository root, then open [the saved local demo](http://127.0.0.1:8081/packages/terrain-core/demo/?durable=1). Accept changes saves through the shared SQLite runtime; Reset preview returns to the last loaded saved terrain. See [host documentation](../../world-runtime/README.md) for storage location and limits. The static port-8080 mode remains temporary.

## 3D inspection and comparison
In Axonometric, drag to orbit; Shift-drag or right-drag pans; scrolling zooms at the cursor. Touch supports one-finger orbit and two-finger pan/pinch. Focus the view for arrow-key rotation, Shift+arrows pan, +/− zoom and Home reset; Fit 3D view restores framing. Plan retains control editing. Camera changes never submit terrain operations. Blue-grey is the last saved base and amber the unsaved proposal; accepting makes the proposal the new base. The bounded SVG camera uses orthographic projection and triangle depth sorting, not a general GPU depth buffer. Physical touch-device behaviour remains unqualified.

The **Proposal opacity** slider reveals the saved base under an unsaved proposal. It changes presentation only: 0% hides the proposal surface, 100% shows it fully, and control points remain attached to the proposal. The slider is disabled when there is no proposed surface. Keyboard Home/End select the extremes.

Edited controls are marked with a magenta ring and point ID in Plan and Axonometric views; the legend counts them. Highlights compare displayed XYZ values with the loaded saved base, including active drag positions. Selection remains separate. Refresh restores draft highlights; resetting, returning a point to its saved coordinates, or accepting removes the relevant highlights. Verified by 70 terrain tests and 18 Chrome workflows.

## Edited-point review and individual reversion
The edited-point table lists saved XYZ, proposed XYZ and signed coordinate differences in millimetres. Select focuses the corresponding node. Revert point restores that point through the terrain resolver and evaluator while retaining other edits. Reverting the final edit returns to the accepted surface and clears the draft. Pending saves and active operations disable individual reversion. Nothing is published until explicit acceptance. Verification: 70 terrain tests and 19 Chrome workflows, including exact deltas, selection, partial reversion/refresh, last-edit cleanup and pending-save protection.

## Exact coordinate entry
The point editor now accepts X, Y and Level/Z in integer millimetres via Preview coordinates. The same terrain resolver validates coordinate edits, preserving the previous draft on invalid input or topology. Coordinate drafts retain refresh recovery, node highlights, signed deltas and individual reversion. Publication still requires Accept changes. Verification: 70 terrain tests and 20 Chrome workflows, including exact XYZ changes, blank/fractional/out-of-range input, duplicate XY rejection and refresh recovery.

Coordinate-entry follow-up: valid X/Y/Z input now previews automatically after a 350 ms pause. New input during evaluation is retained for the next preview. Accept changes waits for the scheduled preview; automatic preview does not publish. Invalid input preserves the last valid geometry. Plan shows XY movement; Axonometric shows elevation changes. Chrome coverage now includes typing-only viewport updates and unchanged saved revision (21 workflows).
