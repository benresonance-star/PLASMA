/**
 * AI tool router — read tools + propose_changeset only.
 * Never allows fabricationReady / brep / threeJs mutations.
 */

import {
  applyChangeSet,
  executeReadTool,
  validateChangeSet,
  type ChangeSet,
  type ChangeSetCommand,
  type ChangeSetCommandOp,
} from './tools.js';
import { whyTool } from './repair.js';
import type { LlmToolDefinition } from './llm-client.js';
import {
  DEFAULT_ACCEPT_OPS,
  type AgentContextPackage,
} from './agent-context.js';

export function buildAiToolDefinitions(
  acceptOps: readonly ChangeSetCommandOp[] = DEFAULT_ACCEPT_OPS,
): readonly LlmToolDefinition[] {
  const ops = [...acceptOps];
  return [
    {
      type: 'function',
      function: {
        name: 'get_context',
        description:
          'Return AgentContextPackage: units, WORLD frame, discover catalogs, mutate capabilities, examples',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'summary',
        description: 'Read-only model summary (object/pattern counts)',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search',
        description: 'Read-only semantic id/kind search',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_changeset',
        description:
          'Propose a semantic ChangeSet on an isolated AI branch. Forbidden: fabricationReady, brep, threeJs. Ops limited to accept-capable set.',
        parameters: {
          type: 'object',
          properties: {
            changeSetId: { type: 'string' },
            targetId: { type: 'string' },
            op: {
              type: 'string',
              enum: ops,
            },
            payload: { type: 'object' },
          },
          required: ['changeSetId', 'op'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'why',
        description: 'Explain semantic lineage for an object id',
        parameters: {
          type: 'object',
          properties: { semanticId: { type: 'string' } },
          required: ['semanticId'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'schema_catalog',
        description: 'Read-only semantic kinds and live model types (discover)',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'lookup',
        description: 'Read-only lookup of a semantic object by id',
        parameters: {
          type: 'object',
          properties: { semanticId: { type: 'string' } },
          required: ['semanticId'],
          additionalProperties: false,
        },
      },
    },
  ];
}

/** Default tool defs — acceptOps-gated (not full create/delete/apply_pattern enum). */
export const AI_TOOL_DEFINITIONS: readonly LlmToolDefinition[] = buildAiToolDefinitions();

export interface ToolRouterContext {
  readonly catalog: {
    readonly objects: readonly { readonly id: string; readonly kind: string }[];
    readonly patterns: readonly string[];
    readonly operators: readonly string[];
    readonly schemaTypes: readonly string[];
  };
  readonly agentBranchId: string;
  readonly sourceBranchId: string;
  readonly currentHeadHash: string;
  readonly transactionId: string;
  /** Capability-gated context; required for get_context tool. */
  readonly agentContext?: AgentContextPackage;
  readonly acceptOps?: readonly ChangeSetCommandOp[];
}

export interface ToolRouterResult {
  readonly ok: boolean;
  readonly name: string;
  readonly data: unknown;
  readonly changeSet?: ChangeSet;
  readonly error?: string;
}

export function routeAiTool(
  name: string,
  argsJson: string,
  ctx: ToolRouterContext,
): ToolRouterResult {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, name, data: null, error: 'Invalid tool arguments JSON' };
  }

  switch (name) {
    case 'get_context': {
      if (!ctx.agentContext) {
        return { ok: false, name, data: null, error: 'AgentContextPackage not bound' };
      }
      return { ok: true, name, data: ctx.agentContext };
    }
    case 'summary': {
      const data = executeReadTool({ tool: 'summary' }, ctx.catalog).data;
      return { ok: true, name, data };
    }
    case 'search': {
      const data = executeReadTool(
        { tool: 'search', query: String(args.query ?? '') },
        ctx.catalog,
      ).data;
      return { ok: true, name, data };
    }
    case 'why': {
      const semanticId = String(args.semanticId ?? '');
      return {
        ok: true,
        name,
        data: whyTool(semanticId, ['pattern', 'compose', 'operator']),
      };
    }
    case 'schema_catalog': {
      const data = executeReadTool({ tool: 'schema_catalog' }, ctx.catalog).data;
      return { ok: true, name, data };
    }
    case 'lookup': {
      const semanticId = String(args.semanticId ?? '');
      const data = executeReadTool({ tool: 'lookup', semanticId }, ctx.catalog).data;
      const param = ctx.agentContext?.mutate.parameters.find(
        (p) => p.id === semanticId || p.targetAliases.includes(semanticId),
      );
      return {
        ok: true,
        name,
        data: param ? { ...(data as object), parameter: param } : data,
      };
    }
    case 'propose_changeset': {
      const op = (args.op as ChangeSetCommand['op']) ?? 'update';
      const allowed = ctx.acceptOps ?? ctx.agentContext?.mutate.acceptOps ?? DEFAULT_ACCEPT_OPS;
      if (!allowed.includes(op)) {
        return {
          ok: false,
          name,
          data: null,
          error: `UNSUPPORTED_OP:${op}`,
        };
      }
      const targetRaw = args.targetId;
      const commands: ChangeSetCommand[] = [
        {
          op,
          ...(typeof targetRaw === 'string' && targetRaw.length > 0
            ? { targetId: targetRaw }
            : op === 'create_group'
              ? {}
              : { targetId: '' }),
          payload: args.payload ?? {},
        },
      ];
      const cs: ChangeSet = {
        changeSetId: String(args.changeSetId ?? `cs:llm:${Date.now()}`),
        branchId: ctx.agentBranchId,
        expectedHeadHash: ctx.currentHeadHash,
        transactionId: ctx.transactionId,
        commands,
        actor: 'ai',
        disposition: 'proposed',
      };
      const v = validateChangeSet(cs);
      if (!v.ok) return { ok: false, name, data: null, error: v.reason ?? 'invalid ChangeSet' };
      try {
        const applied = applyChangeSet({
          changeSet: cs,
          currentHeadHash: ctx.currentHeadHash,
          agentBranchId: ctx.agentBranchId,
          sourceBranchId: ctx.sourceBranchId,
        });
        return { ok: true, name, data: applied, changeSet: applied };
      } catch (err) {
        const error = err instanceof Error ? err.message : 'applyChangeSet failed';
        return { ok: false, name, data: null, error };
      }
    }
    default:
      return { ok: false, name, data: null, error: `Unknown tool ${name}` };
  }
}
