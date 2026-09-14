# Terrain SVG viewport preview

This runnable browser preview connects the existing terrain evaluator,
RepresentationResponse mapper, IPS consumer and module-worker transport to a
real SVG drawing backend. It has not been opened or visually tested in a browser
in this environment and is not deployed to Sites.

From the repository root, serve the package over localhost, for example:

```sh
python -m http.server 8080 --directory packages/terrain-core
```

Then open [the local preview](http://localhost:8080/demo/). Do not open the HTML
with a file URL: module workers and source-digest fetching need an HTTP origin.
Any equivalent static server is suitable. No npm installation is needed for this
page; all modules are relative source imports.

## Implemented UI

- Plan and fixed axonometric projection.
- 25-control synthetic terrain, explicit boundary and breakline, 32 triangles.
- Height tint, boundary/breakline strokes and labelled control handles.
- Pointer/keyboard selection plus a conventional control selector.
- Integer-mm level entry, worker-evaluated temporary preview and reset.
- Representation status and synthetic datum disclosed in the page.

The numeric preview goes through prepareTerrainEdit and the worker evaluator.
The base fixture remains unchanged. Successive previews use the current temporary
candidate, and reset/reload returns to the original fixture. There is no Apply,
WorldTransaction commit, persistence, collaboration or imported survey support.

Camera-mode changes and selection do not submit geometry jobs. The Preview button
is disabled while a job is active. Browser/device performance has not been measured.
Axonometric rendering is a projected SVG diagram, not a depth-correct 3D renderer;
it does not provide orbit, solid occlusion, shaded-normal rendering or drag gizmos.

## SVG adapter boundary

createSvgTerrainSink supplies draw/releaseVisuals to the existing IPS consumer.
The host supplies viewBox-space vertices, ordered triangles, boundary/breakline
segments and semantic anchor projections. The sink checks finite coordinates,
bounded arrays and response/role bindings before mounting its group.

Labels use textContent. Exact editable controls emit frame-bound hit observations;
no operation/commit capability is provided. Key activation supports Enter/Space,
while the selector offers an equivalent conventional input. Release removes only
the sink's owned groups and listeners, and stale captured callbacks do nothing.

The demo uses a bounded transient reference registry, real SHA-256 digests of
artifact bytes and the fetched evaluator-source bundle, and explicit unknown
representation tolerance. The full request envelope is supplied, but the registry
is a preview harness rather than a production WorldSnapshot/WorldTransaction host.
No computed tolerance, complete causal impact or durable evidence is invented.

## Evidence and remaining gates

Seven renderer behaviour tests pass using a minimal DOM test double in V8.
They cover mesh/line/control creation, anchored click/keyboard input, unresolved
controls, text-only labels, owned-resource release, invalid geometry/bindings and
disposal. These test DOM operations, not browser layout, accessibility APIs or pixels.

The actual demo fixture and a +500 mm centre-control preview were evaluated in V8:
25 controls, 32 triangles, original fixture unchanged. The browser module was
syntax-checked after replacing import.meta for the harness. Module loading, Worker
startup, digest fetching, keyboard focus, phone sizing and full end-to-end execution
remain unverified. The aggregate Node launcher contains 70 tests; only the seven new
SVG tests and fixture exercise ran in this increment.

Next: run this page in a restored browser environment, test its complete interaction
loop and physical-device inputs, then package/publish with Sites. Connect a genuine
host transaction store only after that store meets the existing durability contract.
