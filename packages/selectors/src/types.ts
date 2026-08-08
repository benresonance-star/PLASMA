import { z } from 'zod';

export const SELECTOR_KINDS = [
  'selection.semantic-query',
  'selection.sub-element',
  'selection.capability',
] as const;

export type SelectorKind = (typeof SELECTOR_KINDS)[number];

export const SemanticQuerySelectorSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Selector'),
  semanticType: z.literal('selection.semantic-query'),
  where: z.object({
    semanticType: z.string().min(1),
    adjacentTo: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const SubElementSelectorSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Selector'),
  semanticType: z.literal('selection.sub-element'),
  owner: z.string().min(1),
  path: z.array(z.string().min(1)).min(1),
});

export const CapabilitySelectorSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('Selector'),
  semanticType: z.literal('selection.capability'),
  capability: z.string().min(1),
});

export const SelectorSchema = z.discriminatedUnion('semanticType', [
  SemanticQuerySelectorSchema,
  SubElementSelectorSchema,
  CapabilitySelectorSchema,
]);

export type Selector = z.infer<typeof SelectorSchema>;

export function parseSelector(input: unknown): Selector {
  return SelectorSchema.parse(input);
}

export interface SelectableObject {
  readonly id: string;
  readonly semanticType: string;
  readonly tags?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly adjacentTo?: Readonly<Record<string, string>>;
  readonly subElements?: Readonly<Record<string, string>>;
}
