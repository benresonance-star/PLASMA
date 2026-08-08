/**
 * Maps kernel results to persistent semantic paths — never FaceN / EdgeN indices.
 */
export interface KernelSubElement {
  readonly kernelTransientId: string;
  readonly semanticPath: string;
}

export interface NamingOutcome {
  readonly path: string;
  readonly result: 'survived' | 'unresolved' | 'intentional-delete';
  readonly targetId?: string;
  readonly diagnostic?: string;
}

export class KernelHistoryNamingAdapter {
  private readonly pathToStable = new Map<string, string>();

  bind(path: string, stableId: string): void {
    if (/^(Face|Edge|Vertex)\d+$/i.test(stableId)) {
      throw new Error(`Transient kernel index forbidden as design ref: ${stableId}`);
    }
    this.pathToStable.set(path, stableId);
  }

  mapKernelResult(elements: readonly KernelSubElement[]): void {
    for (const el of elements) {
      if (/^(Face|Edge|Vertex)\d+$/i.test(el.kernelTransientId)) {
        // allowed as transient only; must map to semantic path
        this.bind(el.semanticPath, `stable:${el.semanticPath}`);
      } else {
        this.bind(el.semanticPath, el.kernelTransientId);
      }
    }
  }

  resolveAfterMutation(input: {
    path: string;
    remap?: Readonly<Record<string, string>>;
    deletedPaths?: ReadonlySet<string>;
    ambiguousTargets?: readonly string[];
  }): NamingOutcome {
    if (input.deletedPaths?.has(input.path)) {
      return { path: input.path, result: 'intentional-delete' };
    }
    if (input.ambiguousTargets && input.ambiguousTargets.length > 1) {
      return {
        path: input.path,
        result: 'unresolved',
        diagnostic: 'SELECTOR_AMBIGUOUS',
      };
    }
    const prev = this.pathToStable.get(input.path);
    if (!prev) {
      return {
        path: input.path,
        result: 'unresolved',
        diagnostic: 'SELECTOR_UNRESOLVED',
      };
    }
    const next = input.remap?.[prev] ?? prev;
    if (input.remap && prev in (input.remap ?? {}) && next === prev) {
      // remap claimed identity but produced same id incorrectly after replace — silent wrong risk
      return {
        path: input.path,
        result: 'unresolved',
        diagnostic: 'SELECTOR_UNRESOLVED',
      };
    }
    this.pathToStable.set(input.path, next);
    return { path: input.path, result: 'survived', targetId: next };
  }
}
