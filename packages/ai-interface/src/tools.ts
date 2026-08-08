/** G13 AI semantic interface — read tools, ChangeSet, mutations, jobs. */

export interface AiReadToolRequest {
  readonly tool:
    | 'summary'
    | 'lookup'
    | 'search'
    | 'schema_catalog'
    | 'pattern_catalog'
    | 'operator_catalog'
    | 'deps';
  readonly query?: string;
  readonly semanticId?: string;
}

export interface AiReadToolResult {
  readonly tool: AiReadToolRequest['tool'];
  readonly readOnly: true;
  readonly data: unknown;
}

/** Read tools cannot execute SQL or mutate state. */
export function executeReadTool(
  req: AiReadToolRequest,
  catalog: {
    readonly objects: readonly { readonly id: string; readonly kind: string }[];
    readonly patterns: readonly string[];
    readonly operators: readonly string[];
    readonly schemaTypes: readonly string[];
  },
): AiReadToolResult {
  switch (req.tool) {
    case 'summary':
      return {
        tool: req.tool,
        readOnly: true,
        data: { objectCount: catalog.objects.length, patterns: catalog.patterns.length },
      };
    case 'lookup':
      return {
        tool: req.tool,
        readOnly: true,
        data: catalog.objects.find((o) => o.id === req.semanticId) ?? null,
      };
    case 'search':
      return {
        tool: req.tool,
        readOnly: true,
        data: catalog.objects.filter((o) =>
          req.query ? o.id.includes(req.query) || o.kind.includes(req.query) : true,
        ),
      };
    case 'schema_catalog':
      return { tool: req.tool, readOnly: true, data: catalog.schemaTypes };
    case 'pattern_catalog':
      return { tool: req.tool, readOnly: true, data: catalog.patterns };
    case 'operator_catalog':
      return { tool: req.tool, readOnly: true, data: catalog.operators };
    case 'deps':
      return {
        tool: req.tool,
        readOnly: true,
        data: { semanticId: req.semanticId, upstream: [], downstream: [] },
      };
  }
}

export interface ChangeSetCommand {
  readonly op: 'create' | 'update' | 'delete' | 'apply_pattern';
  readonly targetId?: string;
  readonly payload?: unknown;
}

export interface ChangeSet {
  readonly changeSetId: string;
  readonly branchId: string;
  readonly expectedHeadHash: string;
  readonly transactionId: string;
  readonly commands: readonly ChangeSetCommand[];
  readonly actor: 'ai';
  readonly disposition: 'proposed' | 'applied' | 'rejected' | 'conflict';
}

export function validateChangeSet(cs: ChangeSet): { readonly ok: boolean; readonly reason?: string } {
  if (!cs.transactionId) return { ok: false, reason: 'ChangeSet requires DesignTransaction' };
  if (!cs.expectedHeadHash) return { ok: false, reason: 'ChangeSet requires expectedHeadHash' };
  if (cs.commands.length === 0) return { ok: false, reason: 'ChangeSet empty' };
  for (const c of cs.commands) {
    if (c.op === 'update' && c.payload && typeof c.payload === 'object') {
      const p = c.payload as Record<string, unknown>;
      if (p.fabricationReady === true) {
        return { ok: false, reason: 'AI cannot mark fabrication-ready' };
      }
      if (p.brep !== undefined || p.threeJs !== undefined) {
        return { ok: false, reason: 'AI cannot mutate B-rep/Three.js directly' };
      }
    }
  }
  return { ok: true };
}

export function impactPreview(cs: ChangeSet): {
  readonly commandCount: number;
  readonly targetIds: readonly string[];
} {
  return {
    commandCount: cs.commands.length,
    targetIds: cs.commands.map((c) => c.targetId).filter((id): id is string => !!id),
  };
}

export function applyChangeSet(input: {
  readonly changeSet: ChangeSet;
  readonly currentHeadHash: string;
  readonly agentBranchId: string;
  readonly sourceBranchId: string;
}): ChangeSet {
  const v = validateChangeSet(input.changeSet);
  if (!v.ok) throw new Error(v.reason);
  if (input.agentBranchId === input.sourceBranchId) {
    throw new Error('Agent branch must be isolated from source');
  }
  if (input.changeSet.expectedHeadHash !== input.currentHeadHash) {
    return { ...input.changeSet, disposition: 'conflict' };
  }
  return { ...input.changeSet, disposition: 'applied' };
}

export type AiJobKind = 'compile' | 'validate' | 'compare';
export type AiJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AiJob {
  readonly jobId: string;
  readonly kind: AiJobKind;
  readonly status: AiJobStatus;
  readonly result?: unknown;
  readonly failure?: { readonly code: string; readonly summary: string };
}

export function pollJob(job: AiJob): AiJob {
  return job;
}

export interface AiChangesViewItem {
  readonly changeSetId: string;
  readonly disposition: ChangeSet['disposition'];
  readonly commandCount: number;
  readonly attribution: 'ai';
}

export function buildAiChangesView(changeSets: readonly ChangeSet[]): readonly AiChangesViewItem[] {
  return changeSets.map((cs) => ({
    changeSetId: cs.changeSetId,
    disposition: cs.disposition,
    commandCount: cs.commands.length,
    attribution: 'ai' as const,
  }));
}
