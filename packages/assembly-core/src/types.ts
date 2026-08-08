import { z } from 'zod';

export const ComponentDefinitionSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('ComponentDefinition'),
  name: z.string().min(1),
  revision: z.string().min(1),
  interfaceIds: z.array(z.string()).default([]),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const ComponentInstanceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('ComponentInstance'),
  definitionId: z.string().min(1),
  definitionRevision: z.string().min(1),
  frameId: z.string().min(1),
  /** Stable across definition edits. */
  stableInstanceId: z.string().min(1),
});

export const MateTypeSchema = z.enum(['coincident', 'concentric', 'distance', 'aligned-axis']);

export const MateSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Mate'),
  mateType: MateTypeSchema,
  a: z.object({ instanceId: z.string(), selector: z.string() }),
  b: z.object({ instanceId: z.string(), selector: z.string() }),
  distanceMm: z.number().optional(),
});

export const JointSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Joint'),
  jointType: z.enum(['fixed', 'revolute', 'prismatic']),
  mateId: z.string().min(1),
});

export const InterfaceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Interface'),
  ownerDefinitionId: z.string().min(1),
  role: z.string().min(1),
  selector: z.string().min(1),
});

/** Connection intent is distinct from mates/joints. */
export const ConnectionIntentSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('ConnectionIntent'),
  connectionType: z.enum(['bolted', 'welded', 'clamped']),
  interfaceIds: z.array(z.string()).min(1),
  mateId: z.string().optional(),
  fastenerIds: z.array(z.string()).default([]),
});

export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>;
export type ComponentInstance = z.infer<typeof ComponentInstanceSchema>;
export type Mate = z.infer<typeof MateSchema>;
export type Joint = z.infer<typeof JointSchema>;
export type Interface = z.infer<typeof InterfaceSchema>;
export type ConnectionIntent = z.infer<typeof ConnectionIntentSchema>;
