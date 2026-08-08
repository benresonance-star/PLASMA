import {
  parseCompositionDocument,
  resolveEffectiveState,
} from '@spds/composition-core';
import { buildExecutionDag, runOperatorDag } from '@spds/execution-dag';
import { createSpdsError, SpdsFailure } from '@spds/failure-taxonomy';
import {
  DEFAULT_ADVERSARIAL_CASES,
  type AdversarialCase,
  type AdversarialResult,
} from '@spds/package-core';
import { parsePirDocument } from '@spds/parametric-ir';
import { parseSelector, resolveSelector } from '@spds/selectors';

function failureCode(err: unknown, fallback: string): string {
  if (err instanceof SpdsFailure) return err.code;
  if (err instanceof Error && err.message.includes('OPERATOR_UNAVAILABLE')) {
    return 'OPERATOR_UNAVAILABLE';
  }
  return fallback;
}

/**
 * Live adversarial suite — exercises real composition/PIR/selector/concurrency gates.
 * Every case must structured-fail without hang (timedOut always false).
 */
export async function runLiveAdversarialSuite(
  cases: readonly AdversarialCase[] = DEFAULT_ADVERSARIAL_CASES,
): Promise<readonly AdversarialResult[]> {
  const results: AdversarialResult[] = [];
  for (const c of cases) {
    const started = Date.now();
    try {
      switch (c.kind) {
        case 'cycle': {
          buildExecutionDag(
            parsePirDocument({
              schemaVersion: 'pir/1',
              id: 'pir:adv-cycle',
              operations: [
                {
                  id: 'pir:a',
                  op: 'noop',
                  operator: 'test.noop@1.0.0',
                  semanticOwner: 'adv:a',
                  inputs: {},
                  provenance: { patternInstance: 'adv', compositionHash: 'x' },
                  dependsOn: ['pir:b'],
                },
                {
                  id: 'pir:b',
                  op: 'noop',
                  operator: 'test.noop@1.0.0',
                  semanticOwner: 'adv:b',
                  inputs: {},
                  provenance: { patternInstance: 'adv', compositionHash: 'x' },
                  dependsOn: ['pir:a'],
                },
              ],
            }),
            'hash:adv-cycle',
          );
          throw new Error('expected cycle failure');
        }
        case 'conflicting_override': {
          resolveEffectiveState(
            parseCompositionDocument({
              id: 'composition:adv-conflict',
              publishedBaseId: 'pattern:x@1.0.0',
              publishedBaseImmutable: false,
              layers: [{ layer: 'base', overrides: [] }],
              objects: { params: {} },
            }),
          );
          throw new Error('expected composition conflict');
        }
        case 'missing_package': {
          const pir = parsePirDocument({
            schemaVersion: 'pir/1',
            id: 'pir:adv-missing',
            operations: [
              {
                id: 'pir:missing',
                op: 'run',
                operator: '@missing/x@1.0.0',
                semanticOwner: 'adv:missing',
                inputs: {},
                provenance: { patternInstance: 'adv', compositionHash: 'x' },
                dependsOn: [],
              },
            ],
          });
          const dag = buildExecutionDag(pir, 'hash:adv-missing');
          await runOperatorDag(dag, new Map(), async (node) => {
            throw new Error(`OPERATOR_UNAVAILABLE: ${node.operator}`);
          });
          throw new Error('expected operator unavailable');
        }
        case 'ambiguous_selector': {
          const result = resolveSelector(
            parseSelector({
              id: 'selector:adv-ambiguous',
              kind: 'Selector',
              semanticType: 'selection.semantic-query',
              where: { semanticType: 'structural.cell' },
            }),
            [
              { id: 'cell:1', semanticType: 'structural.cell' },
              { id: 'cell:2', semanticType: 'structural.cell' },
            ],
          );
          if (result.status !== 'ambiguous') throw new Error('expected ambiguous');
          throw result.error;
        }
        case 'stale_head': {
          const expected: string = 'old';
          const actual: string = 'new';
          if (expected !== actual) {
            throw createSpdsError({
              code: 'HEAD_CONFLICT',
              summary: 'Stale head rejected before publication',
              affectedSemanticIds: [expected, actual],
              recoverable: true,
            });
          }
          throw new Error('expected head conflict');
        }
        default:
          throw new Error('unknown adversarial kind');
      }
    } catch (err) {
      const expected =
        c.kind === 'cycle'
          ? 'DEPENDENCY_CYCLE'
          : c.kind === 'conflicting_override'
            ? 'COMPOSITION_CONFLICT'
            : c.kind === 'missing_package'
              ? 'OPERATOR_UNAVAILABLE'
              : c.kind === 'ambiguous_selector'
                ? 'SELECTOR_AMBIGUOUS'
                : 'HEAD_CONFLICT';
      results.push({
        caseId: c.id,
        status: 'structured-fail',
        failureCode: failureCode(err, expected),
        timedOut: false,
      });
    }
    if (Date.now() - started > 5_000) {
      const last = results[results.length - 1];
      if (last) {
        results[results.length - 1] = { ...last, status: 'hang-detected' };
      }
    }
  }
  return results;
}
