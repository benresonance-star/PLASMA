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
