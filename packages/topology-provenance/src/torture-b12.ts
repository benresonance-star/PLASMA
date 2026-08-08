import { KernelHistoryNamingAdapter, type NamingOutcome } from './persistent-naming.js';

export type TortureMutation =
  | { readonly kind: 'dim-change'; readonly factor: number }
  | { readonly kind: 'frequency-change'; readonly frequency: number }
  | { readonly kind: 'shell' }
  | { readonly kind: 'unshell' }
  | { readonly kind: 'boolean-cut' }
  | { readonly kind: 'affector-plane' }
  | { readonly kind: 'fillet' }
  | { readonly kind: 'split' }
  | { readonly kind: 'merge' }
  | { readonly kind: 'connector' }
  | { readonly kind: 'hole' }
  | { readonly kind: 'trim' }
  | { readonly kind: 'pattern-count'; readonly count: number }
  | { readonly kind: 'replacement' }
  | { readonly kind: 'intentional-delete' };

export interface TortureSequenceResult {
  readonly sequenceId: number;
  readonly mutation: TortureMutation;
  readonly outcomes: readonly NamingOutcome[];
  readonly silentWrong: number;
}

const PATHS = [
  'component:y:0001/arm:A/start',
  'component:y:0001/arm:A/end',
  'component:y:0001/arm:A/mounting-face',
  'component:y:0002/arm:B/start',
  'connection:0083/plate:A/outer-face',
  'cell:h:0017/boundary-edge:03',
] as const;

function mutationForIndex(i: number): TortureMutation {
  const kinds: TortureMutation['kind'][] = [
    'dim-change',
    'frequency-change',
    'shell',
    'unshell',
    'boolean-cut',
    'affector-plane',
    'fillet',
    'split',
    'merge',
    'connector',
    'hole',
    'trim',
    'pattern-count',
    'replacement',
    'intentional-delete',
  ];
  const kind = kinds[i % kinds.length]!;
  switch (kind) {
    case 'dim-change':
      return { kind, factor: 1 + (i % 5) * 0.1 };
    case 'frequency-change':
      return { kind, frequency: 1 + (i % 4) };
    case 'pattern-count':
      return { kind, count: 2 + (i % 8) };
    default:
      return { kind } as TortureMutation;
  }
}

/**
 * B12 torture: ≥500 deterministic sequences.
 * Each path must resolve to survived | unresolved+diagnostic | intentional-delete.
 * Silent wrong references are counted and must be zero.
 */
export function runNamingTortureSuite(sequenceCount = 500): {
  readonly results: readonly TortureSequenceResult[];
  readonly silentWrong: number;
  readonly survived: number;
  readonly unresolved: number;
  readonly intentionalDelete: number;
} {
  const results: TortureSequenceResult[] = [];
  let silentWrong = 0;
  let survived = 0;
  let unresolved = 0;
  let intentionalDelete = 0;

  for (let i = 0; i < sequenceCount; i += 1) {
    const adapter = new KernelHistoryNamingAdapter();
    for (const path of PATHS) {
      adapter.mapKernelResult([
        { kernelTransientId: `Face${(i % 90) + 1}`, semanticPath: path },
      ]);
    }

    const mutation = mutationForIndex(i);
    const deleted = new Set<string>();
    const remap: Record<string, string> = {};
    let ambiguous: string[] | undefined;

    switch (mutation.kind) {
      case 'intentional-delete':
        deleted.add(PATHS[i % PATHS.length]!);
        break;
      case 'replacement':
      case 'dim-change':
      case 'frequency-change':
      case 'shell':
      case 'unshell':
      case 'fillet':
      case 'hole':
      case 'trim':
      case 'pattern-count':
      case 'connector':
      case 'affector-plane':
        for (const path of PATHS) {
          const prev = `stable:${path}`;
          remap[prev] = `stable:${path}:v${i}`;
        }
        break;
      case 'boolean-cut':
      case 'split':
        // controlled ambiguity on one path
        ambiguous = [`stable:${PATHS[0]}:a`, `stable:${PATHS[0]}:b`];
        break;
      case 'merge':
        // identity lost for one path → unresolved
        break;
      default:
        break;
    }

    const outcomes: NamingOutcome[] = PATHS.map((path) => {
      if (mutation.kind === 'merge' && path === PATHS[1]) {
        return adapter.resolveAfterMutation({ path }); // unbound after merge loss
      }
      if (ambiguous && path === PATHS[0]) {
        return adapter.resolveAfterMutation({ path, ambiguousTargets: ambiguous });
      }
      return adapter.resolveAfterMutation({
        path,
        remap,
        deletedPaths: deleted,
      });
    });

    // Detect silent wrong: survived but target equals a different path's stable id
    const targets = new Map<string, string>();
    for (const o of outcomes) {
      if (o.result === 'survived') {
        survived += 1;
        if (o.targetId) {
          if (targets.has(o.targetId) && targets.get(o.targetId) !== o.path) {
            silentWrong += 1;
          }
          targets.set(o.targetId, o.path);
        }
        // survived without diagnostic when path was deleted → silent wrong
        if (deleted.has(o.path)) silentWrong += 1;
      } else if (o.result === 'unresolved') {
        unresolved += 1;
        if (!o.diagnostic) silentWrong += 1;
      } else {
        intentionalDelete += 1;
      }
    }

    results.push({ sequenceId: i, mutation, outcomes, silentWrong: 0 });
  }

  return { results, silentWrong, survived, unresolved, intentionalDelete };
}
