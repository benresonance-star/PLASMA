/** Deterministic synthetic graphs for SD12 scale benches. */

export function generateSyntheticGraph(size: 1000 | 10000 | 100000): {
  readonly objects: readonly { readonly id: string; readonly semanticType: string }[];
  readonly edges: readonly {
    readonly from: string;
    readonly to: string;
    readonly relationType: string;
  }[];
} {
  const objects: { id: string; semanticType: string }[] = [
    { id: 'pattern:synth', semanticType: 'pattern.network' },
    { id: 'param:synth:length', semanticType: 'parameter.number' },
  ];
  const edges: { from: string; to: string; relationType: string }[] = [
    { from: 'param:synth:length', to: 'pattern:synth', relationType: 'pattern.drives' },
  ];
  const entityCount = Math.max(0, size - 2);
  for (let i = 0; i < entityCount; i += 1) {
    const id = `component:synth:${String(i).padStart(5, '0')}`;
    objects.push({ id, semanticType: 'structural.y-component' });
    edges.push({ from: 'pattern:synth', to: id, relationType: 'produces' });
  }
  return { objects, edges };
}

export function assertProjectionBudget(
  nodeCount: number,
  maxNodes = 500,
): void {
  if (nodeCount > maxNodes) {
    throw new Error(`Projection budget exceeded: ${nodeCount} > ${maxNodes} (aggregate required)`);
  }
}
