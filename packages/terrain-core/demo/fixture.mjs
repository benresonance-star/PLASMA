export const demoTerrain = { id: "terrain", kind: "terrain-controls", schema: "plasma-terrain-controls/1", surfaceRole: "design-ground",
  revision: 0, frameId: "SITE-DEMO", datum: "Synthetic local datum", units: "mm",
  source: { evidenceRef: "synthetic-fixture", contentDigest: "demo-fixture-v1", importerVersion: "demo/1", registrationEvidenceRef: "local-frame-demo" },
  points: Array.from({ length: 25 }, (_, i) => ({ id: "p" + i, revision: 0, x: (i % 5) * 4000, y: Math.floor(i / 5) * 4000,
    z: 100000 + (i % 5) * 80 + Math.floor(i / 5) * 150, evidenceRefs: ["synthetic-fixture"] })),
  features: [{ id: "boundary", revision: 0, kind: "boundary", pointIds: [0,1,2,3,4,9,14,19,24,23,22,21,20,15,10,5].map(i => "p" + i) },
    { id: "ridge", revision: 0, kind: "breakline", pointIds: ["p7", "p12", "p17"] }] };
