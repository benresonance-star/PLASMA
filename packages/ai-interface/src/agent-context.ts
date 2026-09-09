/**
 * AgentContextPackage (TC) — cold-start context for LLM/scripted agents.
 * Discover catalogs may be wider than mutate.acceptOps (G13.1 vs capability gate).
 */

import { CREATE_KINDS_ALLOWLIST, LENGTH_MM_MAX, LENGTH_MM_MIN } from './changeset-accept.js';
import { DEMO_Y_SEMANTIC_ID, PARAM_D01_LENGTH_ID } from './id-map.js';
import type { ChangeSetCommandOp } from './tools.js';

export const AGENT_CONTEXT_SCHEMA_VERSION = 'agent-context/1' as const;
export const AGENT_WORLD_LENGTH_UNIT = 'mm' as const;
export const AGENT_WORLD_UP_AXIS = '+Z' as const;
export const AGENT_VIEWPORT_UP_NOTE =
  'Three.js camera is Y-up for display only; do not use as semantic up. Mutate WORLD (+Z) only.';

/** Ops the accept lowerer supports today (grows with T3–T5). */
export const DEFAULT_ACCEPT_OPS = [
  'update',
  'create',
  'create_group',
  'connect',
  'apply_pattern',
] as const satisfies readonly ChangeSetCommandOp[];

export const DEFAULT_UNSUPPORTED_OPS = ['delete'] as const satisfies readonly ChangeSetCommandOp[];

export { CREATE_KINDS_ALLOWLIST };

export interface AgentContextParameter {
  readonly id: string;
  readonly path: string;
  readonly quantity: { readonly value: number; readonly unit: string };
  readonly domain: { readonly min: number; readonly max: number };
  readonly role: string;
  readonly editableBy: readonly string[];
  readonly targetAliases: readonly string[];
}

export interface AgentContextPackage {
  readonly schemaVersion: typeof AGENT_CONTEXT_SCHEMA_VERSION;
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly transactionId: string;
  readonly world: {
    readonly units: { readonly length: typeof AGENT_WORLD_LENGTH_UNIT; readonly canonical: true };
    readonly frame: {
      readonly role: 'WORLD';
      readonly upAxis: typeof AGENT_WORLD_UP_AXIS;
      readonly handedness: 'right';
    };
    readonly viewportNote: typeof AGENT_VIEWPORT_UP_NOTE;
  };
  readonly discover: {
    readonly kinds: readonly string[];
    readonly patterns: readonly { readonly id: string; readonly status: string }[];
    readonly operators: readonly { readonly id: string }[];
    readonly organisation: {
      readonly folderIds: readonly string[];
      readonly partOfRelation: 'part-of';
    };
    readonly relationships: {
      readonly core: readonly string[];
      readonly sdi: readonly string[];
    };
  };
  readonly mutate: {
    readonly acceptOps: readonly ChangeSetCommandOp[];
    readonly unsupportedOps: readonly ChangeSetCommandOp[];
    readonly parameters: readonly AgentContextParameter[];
    readonly kindsAllowlist: readonly string[];
    readonly maxCommandsPerChangeSet: number;
    readonly quantityStyle: 'suffixedField';
  };
  readonly policy: {
    readonly tolerancePolicyVersion: string;
    readonly maxRepairAttempts: number;
    readonly forbidden: readonly string[];
  };
  readonly examples: readonly unknown[];
  readonly promptHash?: string;
}

export interface BuildAgentContextInput {
  readonly modelId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly transactionId: string;
  readonly catalog?: {
    readonly objects?: readonly { readonly id: string; readonly kind: string }[];
    readonly patterns?: readonly string[];
    readonly operators?: readonly string[];
    readonly schemaTypes?: readonly string[];
  };
  readonly folderIds?: readonly string[];
  readonly lengthMm?: number;
  /** Package-derived mutable parameters. Replaces the D01 fallback when supplied. */
  readonly parameters?: readonly AgentContextParameter[];
  readonly acceptOps?: readonly ChangeSetCommandOp[];
  readonly unsupportedOps?: readonly ChangeSetCommandOp[];
  readonly tolerancePolicyVersion?: string;
}

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16)}`;
}

export function buildAgentContextPackage(input: BuildAgentContextInput): AgentContextPackage {
  const acceptOps = [...(input.acceptOps ?? DEFAULT_ACCEPT_OPS)] as ChangeSetCommandOp[];
  const unsupportedOps = [
    ...(input.unsupportedOps ?? DEFAULT_UNSUPPORTED_OPS),
  ] as ChangeSetCommandOp[];
  const lengthMm = input.lengthMm ?? 2300;
  const kinds = [...(input.catalog?.schemaTypes ?? ['Parameter', 'Pattern', 'Entity'])].sort(
    (a, b) => a.localeCompare(b),
  );
  const patterns = (input.catalog?.patterns ?? ['pattern:goldberg-cellular-topology@1.0.0']).map(
    (id) => ({ id, status: 'published' as const }),
  );
  const operators = (input.catalog?.operators ?? ['y-network.v1']).map((id) => ({ id }));

  const parameters: AgentContextParameter[] = input.parameters
    ? input.parameters.map((parameter) => ({
        ...parameter,
        quantity: { ...parameter.quantity },
        domain: { ...parameter.domain },
        editableBy: [...parameter.editableBy],
        targetAliases: [...parameter.targetAliases],
      }))
    : [
        {
          id: PARAM_D01_LENGTH_ID,
          path: 'lengthMm',
          quantity: { value: lengthMm, unit: AGENT_WORLD_LENGTH_UNIT },
          domain: { min: LENGTH_MM_MIN, max: LENGTH_MM_MAX },
          role: 'design-variable',
          editableBy: ['user', 'agent'],
          targetAliases: [DEMO_Y_SEMANTIC_ID, 'Y:1', PARAM_D01_LENGTH_ID],
        },
      ];

  const example = {
    changeSetId: 'cs:example:length',
    branchId: input.branchId,
    expectedHeadHash: input.expectedHeadHash,
    transactionId: input.transactionId,
    actor: 'ai',
    disposition: 'proposed',
    commands: [
      {
        op: 'update',
        targetId: DEMO_Y_SEMANTIC_ID,
        payload: { lengthMm: 2000 },
      },
    ],
  };

  const pkg: AgentContextPackage = {
    schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
    modelId: input.modelId,
    branchId: input.branchId,
    expectedHeadHash: input.expectedHeadHash,
    transactionId: input.transactionId,
    world: {
      units: { length: AGENT_WORLD_LENGTH_UNIT, canonical: true },
      frame: {
        role: 'WORLD',
        upAxis: AGENT_WORLD_UP_AXIS,
        handedness: 'right',
      },
      viewportNote: AGENT_VIEWPORT_UP_NOTE,
    },
    discover: {
      kinds,
      patterns,
      operators,
      organisation: {
        folderIds: [...(input.folderIds ?? [])],
        partOfRelation: 'part-of',
      },
      relationships: {
        core: ['part-of', 'depends-on', 'generated-from'],
        sdi: ['DEPENDS_ON', 'GENERATES', 'CONTAINS'],
      },
    },
    mutate: {
      acceptOps,
      unsupportedOps,
      parameters,
      kindsAllowlist: [...CREATE_KINDS_ALLOWLIST],
      maxCommandsPerChangeSet: 20,
      quantityStyle: 'suffixedField',
    },
    policy: {
      tolerancePolicyVersion: input.tolerancePolicyVersion ?? '1.0.0',
      maxRepairAttempts: 3,
      forbidden: ['fabricationReady', 'brep', 'threeJs', 'meshes', 'markdown', 'sql'],
    },
    examples: [example],
  };

  return {
    ...pkg,
    promptHash: stableHash(renderAgentSystemPrompt(pkg)),
  };
}

/** System prompt: units, dual-frame, acceptOps, example — no outside knowledge required. */
export function renderAgentSystemPrompt(ctx: AgentContextPackage): string {
  const ops = ctx.mutate.acceptOps.join(' | ');
  const unsupported = ctx.mutate.unsupportedOps.join(', ');
  const params = ctx.mutate.parameters
    .map(
      (p) =>
        `${p.id} path=${p.path} value=${p.quantity.value}${p.quantity.unit} domain=[${p.domain.min},${p.domain.max}] aliases=${p.targetAliases.join('|')}`,
    )
    .join('; ');
  const example = JSON.stringify(ctx.examples[0] ?? {});
  return [
    'You are the SPDS design agent. Use tools only. Propose semantic ChangeSets via propose_changeset.',
    `Canonical length unit: ${ctx.world.units.length} (canonical=${ctx.world.units.canonical}).`,
    `Semantic WORLD frame: upAxis=${ctx.world.frame.upAxis}, handedness=${ctx.world.frame.handedness}.`,
    ctx.world.viewportNote,
    `modelId=${ctx.modelId}; branchId=${ctx.branchId}; expectedHeadHash=${ctx.expectedHeadHash}; transactionId=${ctx.transactionId}.`,
    `Accept-capable ops: ${ops}. Unsupported (do not propose): ${unsupported}.`,
    `Mutable parameters (editableBy includes agent): ${params}.`,
    `Quantity style: ${ctx.mutate.quantityStyle} (e.g. payload.lengthMm number in mm).`,
    `Forbidden fields: ${ctx.policy.forbidden.join(', ')}.`,
    `Max repair attempts: ${ctx.policy.maxRepairAttempts}. Never silently relax domains or tolerance policy ${ctx.policy.tolerancePolicyVersion}.`,
    `Example ChangeSet JSON: ${example}`,
  ].join(' ');
}

export function assertAcceptOpsSubset(
  acceptOps: readonly ChangeSetCommandOp[],
  supported: readonly ChangeSetCommandOp[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  for (const op of acceptOps) {
    if (!supported.includes(op)) {
      return { ok: false, reason: `acceptOps contains unsupported op ${op}` };
    }
  }
  return { ok: true };
}
