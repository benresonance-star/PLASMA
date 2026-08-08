import { z } from 'zod';

/**
 * Semantic command vocabulary (§7.6) — typed envelopes for API/transaction entry.
 * Mutating commands require expectedHeadHash (optimistic concurrency).
 */

export const SEMANTIC_COMMANDS = [
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
  'CONNECT',
  'DISCONNECT',
  'COMPOSE',
  'SPECIALISE',
  'FORK',
  'APPLY',
  'REMOVE',
  'EVALUATE',
  'VALIDATE',
  'COMPILE',
  'GENERATE',
  'EXPORT',
  'SNAPSHOT',
  'RESTORE',
  'COMPARE',
] as const;

export type SemanticCommandName = (typeof SEMANTIC_COMMANDS)[number];

export const SemanticCommandEnvelopeSchema = z.object({
  commandId: z.string().min(1),
  command: z.enum(SEMANTIC_COMMANDS),
  modelId: z.string().min(1),
  branchId: z.string().min(1),
  expectedHeadHash: z.string().min(1).optional(),
  actorId: z.string().min(1),
  actorType: z.enum(['user', 'ai', 'system']).default('user'),
  payload: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().min(1).optional(),
});

export type SemanticCommandEnvelope = z.infer<typeof SemanticCommandEnvelopeSchema>;

const MUTATING: ReadonlySet<SemanticCommandName> = new Set([
  'CREATE',
  'UPDATE',
  'DELETE',
  'CONNECT',
  'DISCONNECT',
  'COMPOSE',
  'SPECIALISE',
  'FORK',
  'APPLY',
  'REMOVE',
  'GENERATE',
  'SNAPSHOT',
  'RESTORE',
]);

export function isMutatingCommand(command: SemanticCommandName): boolean {
  return MUTATING.has(command);
}

export function parseSemanticCommand(input: unknown): SemanticCommandEnvelope {
  const env = SemanticCommandEnvelopeSchema.parse(input);
  if (isMutatingCommand(env.command) && !env.expectedHeadHash) {
    throw new Error('HEAD_CONFLICT: mutating commands require expectedHeadHash');
  }
  return env;
}

/** Map semantic API command → transaction DesignCommand type when applicable. */
export function toDesignCommandType(
  command: SemanticCommandName,
): 'SET_PARAMETER' | 'CREATE_OBJECT' | 'DELETE_OBJECT' | 'APPLY_PATTERN' | null {
  switch (command) {
    case 'CREATE':
      return 'CREATE_OBJECT';
    case 'UPDATE':
      return 'SET_PARAMETER';
    case 'DELETE':
    case 'REMOVE':
      return 'DELETE_OBJECT';
    case 'APPLY':
    case 'SPECIALISE':
    case 'FORK':
      return 'APPLY_PATTERN';
    default:
      return null;
  }
}

export interface SemanticCommandResult {
  readonly commandId: string;
  readonly command: SemanticCommandName;
  readonly status: 'accepted' | 'rejected';
  readonly failureCode?: string;
  readonly designCommandType?: string;
}

export function acceptSemanticCommand(input: unknown): SemanticCommandResult {
  try {
    const env = parseSemanticCommand(input);
    const designCommandType = toDesignCommandType(env.command) ?? undefined;
    return {
      commandId: env.commandId,
      command: env.command,
      status: 'accepted',
      ...(designCommandType !== undefined ? { designCommandType } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SEMANTIC_INVALID';
    const failureCode = message.startsWith('HEAD_CONFLICT')
      ? 'HEAD_CONFLICT'
      : 'SEMANTIC_INVALID';
    const partial = SemanticCommandEnvelopeSchema.safeParse(input);
    return {
      commandId: partial.success ? partial.data.commandId : 'command:unknown',
      command: partial.success ? partial.data.command : 'VALIDATE',
      status: 'rejected',
      failureCode,
    };
  }
}

export const packageId = '@spds/semantic-commands' as const;
