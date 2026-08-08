import { ProvenanceStore } from '@spds/topology-provenance';
import { IndexedSemanticGraph } from './graph.js';

/** Reference fixture for G3B gate: Y adjacent to pentagon + derived panel. */
export function buildG3bFixture(): {
  readonly graph: IndexedSemanticGraph;
  readonly provenance: ProvenanceStore;
  readonly dependencyEdges: ReadonlyArray<{ readonly from: string; readonly to: string }>;
  readonly persistentPath: string;
} {
  const graph = new IndexedSemanticGraph([
    {
      id: 'cell:h:0017',
      semanticType: 'topology.cell',
      tags: ['pentagon'],
      attributes: { cellType: 'pentagon' },
      edges: [{ type: 'adjacent', to: 'component:y:0042' }],
    },
    {
      id: 'component:y:0042',
      semanticType: 'structural.y-component',
      tags: ['primary'],
      attributes: { lengthMm: 2500 },
      edges: [
        { type: 'adjacent', to: 'cell:h:0017' },
        { type: 'derives', to: 'part:panel:0042' },
      ],
      capabilities: ['fabricate.panel'],
    },
    {
      id: 'part:panel:0042',
      semanticType: 'product.part',
      attributes: { lengthMm: 2500 },
      edges: [{ type: 'derived-from', to: 'component:y:0042' }],
    },
    {
      id: 'param:frequency',
      semanticType: 'parameter.number',
      attributes: { value: 2 },
    },
  ]);

  const provenance = new ProvenanceStore();
  provenance.write({
    id: 'prov:y42',
    semanticAnchor: 'component:y:0042',
    relation: 'generated-from',
    pirOperationId: 'pir:topology.goldberg',
    kernelResultId: 'kernel:topo:1',
    subElementIds: ['face:ref:0042-a'],
    causes: ['param:frequency'],
  });
  provenance.write({
    id: 'prov:panel42',
    semanticAnchor: 'part:panel:0042',
    relation: 'generated-from',
    pirOperationId: 'pir:panel.derive',
    subElementIds: [],
    causes: ['component:y:0042'],
  });

  return {
    graph,
    provenance,
    dependencyEdges: [
      { from: 'param:frequency', to: 'component:y:0042' },
      { from: 'component:y:0042', to: 'part:panel:0042' },
    ],
    persistentPath: 'component:y:0042/arm:A/mounting-face',
  };
}
