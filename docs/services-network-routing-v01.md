# Plasma / Building Services Network Engine v0.1

**Status:** working prototype; non-authoritative, not certified, not yet integrated into the Build 3D app.

## Capabilities

- Typed water / electrical / HVAC / drainage / gas service runs, dimensional endpoints, route ownership, and bounded 3D house envelope.
- Geometric grid-routing of water and electrical, using six direct orthogonal candidates and bounded deterministic A* when needed.
- 3D structural and architectural AABB keep-outs, supplied pipe radius/clearance, and conservative spacing from already routed services.
- Clash discovery, automatic orthogonal rerouting, unresolved-clash reporting, source/destination blockage and search-budget failures.
- Uncommitted candidate output: route points, total length, bend count, issue codes, semantic owners and renderer-neutral segments.

**Not engineered:** HVAC, DWV, and gas are explicitly blocked until specialist solvers exist. Geometric route success does not mean hydraulic, airflow, electrical, fire, maintenance, construction, Australian/Victorian code or regulatory compliance. Never fabricate or approve from this output.

## Commands

From the monorepo root:

- `pnpm --filter @spds/services-network-core test`
- `pnpm --filter @spds/services-network-core typecheck`
- `pnpm --filter @spds/services-network-core build`

## Next integration gates

1. Build/Plasma: canonical semantic \`ServiceSystem\`, \`Port\`, \`Run\` and \`EngineeringIssue\` records with typed owner/source ids. Convert authoritative B-rep to conservative collision proxies.
2. Generate in an isolated snapshot and attach output to existing ChangeSet/WorldTransaction proposal workflow, without automatic commit. Show before/after routes and explicit unresolved engineering evidence.
3. Replace fixed grid with hybrid topology/clearance routing, real fittings, network branches and real-time invalidation/recompute.
4. Add independent HVAC, water, drainage, electrical and gas engineering validators plus human professional review before making any construction-ready claims.
