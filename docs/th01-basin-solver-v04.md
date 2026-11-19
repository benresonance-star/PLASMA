# TH-01 basin → stack | Gravity solver and assembly validation v0.4

Status: **indicative engineering benchmark, not an approved or construction-ready hydraulic design.** The model is separate from authoritative Build state and never commits changes.

The physical benchmark uses a basin, water-seal trap, compression-to-solvent adapter, transit through a non-structural service-wall stud bay, a swept 90° into a vertical dropper, a sleeved opening through the framed upper floor sheet, another 90° long-sweep into the joist-bay branch, a graded 40 DN pipe, a 45° junction to the nominal 100 DN stack, three support locations and a stack cleanout.

The default branch is 1,630 mm projected length, 32.6 mm fall, nominal 1:50 slope, assumed 38 mm internal diameter and Manning n=0.011. The default fixture discharge 0.12 L/s is a **scenario input**, not a fixture-unit or standards-derived design loading.

## Calculation contracts

- Manning steady uniform partially-full open-channel flow in a circular pipe. Internally compute wetted area, perimeter, hydraulic radius, Q, normal depth and average velocity.
- Scan depth 0–100% for an approximate maximum open-channel discharge; binary-search the shallow/normal branch when demand ≤ capacity. Do not substitute a full-flow or pressurised answer if demand exceeds open-channel capacity.
- Apply separate geometric checks for port coincidence/opposing axes, nominal DN, nominal bend/wye angles, directional connectivity, joist/stud/plate interference, sleeve location and an **illustrative** maximum support interval and minimum grade.
- Render flow only if all hard geometric and hydraulic checks pass. Always report soft evidence gaps independently.
- Recompute route invert geometry from slope. A deliberate colliding joist or opened socket must block the demo.

**Not solved:** fixture/stack hydraulics under transients, vent air pressure, trap seal depth, self-cleansing velocity, downstream backpressure, connection assembly/fitting dimensions to real supplier objects, support design, water/fire/acoustic membrane continuity, AS/NZS 3500.2:2025 or NCC 2025 compliance. The constant-roughness Manning approximation describes only the graded branch, not a certified whole-system hydraulic solution.

Verification: `pnpm --filter @spds/basin-drain-core test`. Expected evidence in dedicated CI plus browser mobile screenshot/interactive controls in the separate basin lab.
