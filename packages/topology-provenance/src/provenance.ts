import { z } from 'zod';

export const PROVENANCE_RELATIONS = [
  'generated-from',
  'modified-from',
  'split-from',
  'merged-from',
  'trimmed-from',
  'deleted-by',
  'survives-as',
] as const;

export type ProvenanceRelation = (typeof PROVENANCE_RELATIONS)[number];

export const TopologyProvenanceRecordSchema = z.object({
  id: z.string().min(1),
  semanticAnchor: z.string().min(1),
  relation: z.enum(PROVENANCE_RELATIONS),
  pirOperationId: z.string().min(1),
  kernelResultId: z.string().min(1).optional(),
  subElementIds: z.array(z.string()).default([]),
  causes: z.array(z.string()).default([]),
});

export type TopologyProvenanceRecord = z.infer<typeof TopologyProvenanceRecordSchema>;

export function parseProvenanceRecord(input: unknown): TopologyProvenanceRecord {
  return TopologyProvenanceRecordSchema.parse(input);
}

export class ProvenanceStore {
  private readonly byId = new Map<string, TopologyProvenanceRecord>();
  private readonly byAnchor = new Map<string, string[]>();

  write(record: TopologyProvenanceRecord): void {
    const parsed = parseProvenanceRecord(record);
    this.byId.set(parsed.id, parsed);
    const list = this.byAnchor.get(parsed.semanticAnchor) ?? [];
    list.push(parsed.id);
    this.byAnchor.set(parsed.semanticAnchor, list);
  }

  get(id: string): TopologyProvenanceRecord | undefined {
    return this.byId.get(id);
  }

  bySemanticAnchor(anchor: string): TopologyProvenanceRecord[] {
    return (this.byAnchor.get(anchor) ?? [])
      .map((id) => this.byId.get(id)!)
      .filter(Boolean);
  }

  all(): TopologyProvenanceRecord[] {
    return [...this.byId.values()];
  }
}
