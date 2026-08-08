/** G10A.1 Product topology — assembly/part/subpart with design→product provenance. */

export interface ProductNode {
  readonly id: string;
  readonly kind: 'assembly' | 'part' | 'subpart';
  readonly name: string;
  readonly children: readonly string[];
}

export interface DesignProductMapping {
  readonly designSemanticId: string;
  readonly productNodeId: string;
  /** One design member is not assumed to be one solid. */
  readonly solidIds: readonly string[];
  readonly provenance: {
    readonly snapshotId: string;
    readonly generatedBy: string;
  };
}

export interface ProductTopology {
  readonly rootId: string;
  readonly nodes: ReadonlyMap<string, ProductNode>;
  readonly mappings: readonly DesignProductMapping[];
}

export function buildProductTopology(input: {
  readonly root: ProductNode;
  readonly nodes: readonly ProductNode[];
  readonly mappings: readonly DesignProductMapping[];
}): ProductTopology {
  const map = new Map<string, ProductNode>();
  map.set(input.root.id, input.root);
  for (const n of input.nodes) map.set(n.id, n);
  return { rootId: input.root.id, nodes: map, mappings: input.mappings };
}

export function queryMappingsForDesign(
  topology: ProductTopology,
  designSemanticId: string,
): readonly DesignProductMapping[] {
  return topology.mappings.filter((m) => m.designSemanticId === designSemanticId);
}

export function solidsForDesignMember(
  topology: ProductTopology,
  designSemanticId: string,
): readonly string[] {
  return queryMappingsForDesign(topology, designSemanticId).flatMap((m) => m.solidIds);
}
