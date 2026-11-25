# Vector Engine foundation checkpoint
Baseline: 89ec062fc3d79abf324f35e6a6cc909e1a490291. Branch: vector-engine/ve001-008-foundation.
Authority: PLS-REP-01 and PLS-DOC-01. Physical state is transaction-governed; accepted exact geometry is geometric authority; authored document intent is versioned; generated vector strokes are derived.
- VE001 partial: repository paths and contracts inspected; latest desktop distribution parity unverified.
- VE002 blocked: local network and package installation unavailable; baseline regression not run.
- VE003–006 candidate: representation-core boundary, five revision pins, model-mm x-right/y-down, paper-mm pens, semantic owner/representation/topology refs.
- VE007 candidate: five synthetic unit tests written, not yet executed.
- VE008 incomplete: pure SVG backend exists, native projection and feature-flagged viewport not integrated.
No gate accepted. Canonical spec status unchanged. Producer supplies paint order and visibility. Kernel evidence DTO is producer-asserted until native producer is verified. Current line/polyline/region renderer is not HLR. XML control characters and extreme numeric ranges need further hardening. No added dependencies.
Next: establish baseline CI; verify desktop source parity; add native orthographic projection with lineage; feature-flag viewport; run regressions and only then advance. Never substitute mesh edges or synthetic data as native projection evidence. No paid dependencies without approval.

## Checkpoint 02
First CI: vector scene tests 5/5, lint 50/50, typecheck 89/89, Atlas build 39/39. Global suite failed in unchanged semantic schema and geometry performance tests; Atlas B17 recovery returned compatible rather than exact. Baseline attribution not established. CI links: https://github.com/benresonance-star/PLASMA/actions/runs/45625615662 and https://github.com/benresonance-star/PLASMA/actions/runs/45625615774.
Added experimental native orthographic mapped-line projection endpoint and native tests. It reads actual B-rep curve endpoints, not mesh edges, with orthonormal view axes and fail-closed binding check. Existing bounds-based edge mapping is provisional. Does not classify visibility or guarantee all B-rep edges are mapped. Projection digest is not a building revision pin; representation IDs can be reused across rebuilds. Do not feed into issued documentation before revision/identity bridge and native verification. New tests not yet run. No gate accepted; no paid dependencies; no merge.

## Checkpoint 03
Native CI job (not the continue-on-error workflow summary) 28/29 tests passed: rectangular prism B-rep projection and source rejection passed. Test harness failed because buildGeometryServer returns {app,kernel}. Corrected and added native HTTP success and actual non-native kernel rejection tests. Vector tests 5/5; global performance and release recovery failures persist. Added explicitly unclassified native wireframe preview adapter, blocked publication/freshness, visible SVG warning, and three DTO tests. Added strict vector-specific CI candidate with real native end-to-end artifact script. No claim of accepted HLR, durable identity, project integration or publication. New changes unverified. CI job: https://github.com/benresonance-star/PLASMA/actions/runs/45700336142/job/139508463995. Desktop parity and baseline attribution remain open.
