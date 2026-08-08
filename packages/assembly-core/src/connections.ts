import { z } from 'zod';

/** G11.1 Physical connections — distinct from Mate/Joint/Interface. */

export const ConnectionSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Connection'),
  connectionType: z.enum(['bolted', 'welded', 'clamped', 'pinned']),
  componentInstanceIds: z.array(z.string()).min(2),
  /** May reference a mate/interface but is never conflated with Mate. */
  relatedMateId: z.string().optional(),
  relatedInterfaceIds: z.array(z.string()).default([]),
  patternId: z.string().optional(),
  fastenerIds: z.array(z.string()).default([]),
});

export type Connection = z.infer<typeof ConnectionSchema>;

export interface ConnectsToRelation {
  readonly fromInstanceId: string;
  readonly toInstanceId: string;
  readonly connectionId: string;
  readonly relation: 'connects-to';
}

export function connectsToRelations(connection: Connection): ConnectsToRelation[] {
  const ids = connection.componentInstanceIds;
  const relations: ConnectsToRelation[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      relations.push({
        fromInstanceId: ids[i]!,
        toInstanceId: ids[j]!,
        connectionId: connection.id,
        relation: 'connects-to',
      });
    }
  }
  return relations;
}

export function assertNotMate(connection: Connection): void {
  if ((connection as { kind: string }).kind === 'Mate') {
    throw new Error('Connection must not be a Mate');
  }
}
