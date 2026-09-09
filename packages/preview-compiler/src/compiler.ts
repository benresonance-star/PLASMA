import {
  parseGeometryCompileRequest,
  type GeometryCompileOp,
  type GeometryCompileRequest,
} from '@spds/geometry-contracts';
import type { PirDocument, PirOperation } from '@spds/parametric-ir';
import { sha256Canonical } from '@spds/reproducibility';

export interface PreviewLoweringContext {
  readonly operation: PirOperation;
  readonly output: unknown;
  readonly parameters: Readonly<Record<string, number>>;
}

export interface PreviewLowerer {
  readonly capability: string;
  lower(context: PreviewLoweringContext): readonly GeometryCompileOp[];
}

export class PreviewLowererRegistry {
  private readonly lowerers = new Map<string, PreviewLowerer>();

  register(lowerer: PreviewLowerer): void {
    if (this.lowerers.has(lowerer.capability)) {
      throw new Error(`Preview lowerer already registered: ${lowerer.capability}`);
    }
    this.lowerers.set(lowerer.capability, lowerer);
  }

  resolve(capabilities: readonly string[]): PreviewLowerer | undefined {
    const matches = capabilities.flatMap((capability) => {
      const lowerer = this.lowerers.get(capability);
      return lowerer ? [lowerer] : [];
    });
    if (matches.length > 1) {
      throw new Error(
        `Ambiguous preview capabilities: ${matches.map((match) => match.capability).join(', ')}`,
      );
    }
    return matches[0];
  }

  list(): readonly string[] {
    return [...this.lowerers.keys()].sort();
  }
}

export function compilePreviewRequest(input: {
  readonly pir: PirDocument;
  readonly pirHash: string;
  readonly dagHash: string;
  readonly outputs: ReadonlyMap<string, unknown>;
  readonly registry: PreviewLowererRegistry;
  readonly parameters?: Readonly<Record<string, number>>;
  readonly compilerVersion?: string;
}): GeometryCompileRequest {
  const parameters = { ...(input.parameters ?? {}) };
  const ops: GeometryCompileOp[] = [];

  for (const operation of input.pir.operations) {
    const capabilities = operation.produces?.form?.capabilities ?? [];
    const lowerer = input.registry.resolve(capabilities);
    if (!lowerer) continue;
    if (!input.outputs.has(operation.id)) {
      throw new Error(`Preview output missing for ${operation.id} (${lowerer.capability})`);
    }
    ops.push(
      ...lowerer.lower({
        operation,
        output: input.outputs.get(operation.id),
        parameters,
      }),
    );
  }

  if (ops.length === 0) {
    throw new Error('No preview-capable Form IR products were lowered');
  }

  const snapshotHash = `snapshot:preview:${sha256Canonical({
    pirHash: input.pirHash,
    parameters,
    operations: ops,
  }).slice(0, 16)}`;

  return parseGeometryCompileRequest({
    snapshotHash,
    pirHash: input.pirHash,
    dagHash: input.dagHash,
    compilerVersion: input.compilerVersion ?? 'preview-compiler@0.0.0',
    parameters,
    ops,
  });
}
