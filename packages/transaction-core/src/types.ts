import { z } from 'zod';

export const TransactionStatusSchema = z.enum([
  'open',
  'validating',
  'compiling',
  'gated',
  'committed',
  'aborted',
  'failed',
]);

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const DesignCommandSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['SET_PARAMETER', 'CREATE_OBJECT', 'DELETE_OBJECT', 'APPLY_PATTERN', 'AI_CHANGESET']),
  targetIds: z.array(z.string()).default([]),
  payload: z.record(z.string(), z.unknown()).default({}),
  compensating: z
    .object({
      type: z.string(),
      payload: z.record(z.string(), z.unknown()),
    })
    .optional(),
});

export type DesignCommand = z.infer<typeof DesignCommandSchema>;

export const DesignTransactionSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  branchId: z.string().min(1),
  actorId: z.string().min(1),
  actorType: z.enum(['user', 'ai', 'system']),
  expectedHeadHash: z.string().min(1),
  idempotencyKey: z.string().min(1),
  status: TransactionStatusSchema,
  commands: z.array(DesignCommandSchema).default([]),
  candidateRevisionId: z.string().optional(),
  publicationManifestId: z.string().optional(),
  failureStage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DesignTransaction = z.infer<typeof DesignTransactionSchema>;

export interface CandidateRevision {
  readonly id: string;
  readonly transactionId: string;
  readonly objects: Readonly<Record<string, unknown>>;
  readonly published: false;
}

export interface PublicationManifest {
  readonly id: string;
  readonly transactionId: string;
  readonly snapshotHash: string;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly envHash: string;
  readonly validationHash: string;
  readonly artifactHashes: readonly string[];
  readonly workerGeneration: number;
}

export interface PublicationGateResult {
  readonly ok: boolean;
  readonly reason?: string;
}
