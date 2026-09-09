import { z } from 'zod';
import { FormProductSchema } from './form-ir.js';

const FORBIDDEN_JS_KEYS = new Set(['js', 'javascript', 'eval', 'script', 'fn', 'function']);

function rejectEmbeddedJs(value: unknown, path: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => rejectEmbeddedJs(v, [...path, String(i)]));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_JS_KEYS.has(key.toLowerCase())) {
        throw new Error(
          `PIR must not embed arbitrary JavaScript (key: ${[...path, key].join('.')})`,
        );
      }
      if (typeof child === 'string' && /^\s*(?:function\b|=>)/.test(child)) {
        throw new Error(`PIR must not embed JavaScript source at ${[...path, key].join('.')}`);
      }
      rejectEmbeddedJs(child, [...path, key]);
    }
  }
}

export const PirInputRefSchema = z.union([
  z.object({ selector: z.string().min(1) }),
  z.object({ value: z.unknown() }),
  z.object({ pirRef: z.string().min(1) }),
]);

export const PirOperationSchema = z
  .object({
    id: z.string().min(1),
    op: z.string().min(1),
    operator: z.string().regex(/^.+@.+$/),
    semanticOwner: z.string().min(1),
    inputs: z.record(z.string(), PirInputRefSchema),
    frame: z
      .object({
        source: z.string().min(1),
      })
      .optional(),
    produces: z
      .object({
        role: z.string().min(1),
        form: FormProductSchema.optional(),
      })
      .optional(),
    provenance: z.object({
      patternInstance: z.string().min(1),
      compositionHash: z.string().min(1),
      variantSelection: z
        .object({
          variantSetId: z.string(),
          selectedVariantIds: z.array(z.string()),
        })
        .optional(),
    }),
    dependsOn: z.array(z.string()).default([]),
  })
  .superRefine((op, ctx) => {
    try {
      rejectEmbeddedJs(op, []);
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: err instanceof Error ? err.message : 'Invalid PIR',
      });
    }
  });

export const PirDocumentSchema = z.object({
  schemaVersion: z.literal('pir/1'),
  id: z.string().min(1),
  operations: z.array(PirOperationSchema).min(1),
});

export type PirOperation = z.infer<typeof PirOperationSchema>;
export type PirDocument = z.infer<typeof PirDocumentSchema>;

export function parsePirDocument(input: unknown): PirDocument {
  return PirDocumentSchema.parse(input);
}
