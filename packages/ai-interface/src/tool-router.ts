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
} from './tools.js';
import { whyTool } from './repair.js';
import type { LlmToolDefinition } from './llm-client.js';

export const AI_TOOL_DEFINITIONS: readonly LlmToolDefinition[] = [
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
        'Propose a semantic ChangeSet on an isolated AI branch. Forbidden: fabricationReady, brep, threeJs.',
      parameters: {
        type: 'object',
        properties: {
          changeSetId: { type: 'string' },
          targetId: { type: 'string' },
          op: { type: 'string', enum: ['create', 'update', 'delete', 'apply_pattern'] },
          payload: { type: 'object' },
        },
        required: ['changeSetId', 'targetId', 'op'],
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
];

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
    case 'propose_changeset': {
      const commands: ChangeSetCommand[] = [
        {
          op: (args.op as ChangeSetCommand['op']) ?? 'update',
          targetId: String(args.targetId ?? ''),
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
