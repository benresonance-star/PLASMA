import { z } from 'zod';
import { SemanticObjectSchema } from './envelope.js';

const ConditionSchema = z.object({
  property: z.string().min(1),
  equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  exists: z.boolean().optional(),
});

const ActionSchema = z.object({
  action: z.enum(['apply-pattern', 'set-parameter', 'add-constraint', 'tag']),
  pattern: z.string().optional(),
  parameterId: z.string().optional(),
  value: z.unknown().optional(),
  tag: z.string().optional(),
});

/** Declarative rules only — reject arbitrary JS payloads. */
export const RuleSchema = SemanticObjectSchema.extend({
  kind: z.literal('Rule'),
  when: z.object({
    all: z.array(ConditionSchema).min(1),
  }),
  then: z.array(ActionSchema).min(1),
  script: z.never().optional(),
  javascript: z.never().optional(),
  code: z.never().optional(),
});

export type Rule = z.infer<typeof RuleSchema>;

export function parseRule(input: unknown): Rule {
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const banned of ['script', 'javascript', 'code', 'eval', 'fn']) {
      if (banned in record) {
        throw new Error(`Rule must not contain arbitrary code field: ${banned}`);
      }
    }
  }
  return RuleSchema.parse(input);
}
