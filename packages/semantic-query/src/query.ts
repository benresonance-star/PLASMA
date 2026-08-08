import { z } from 'zod';
import type { IndexedSemanticGraph, QueryableObject } from './graph.js';

export const QueryAstSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('QUERY'),
    semanticType: z.string().optional(),
    tag: z.string().optional(),
    capability: z.string().optional(),
  }),
  z.object({
    op: z.literal('FILTER'),
    where: z.object({
      semanticType: z.string().optional(),
      tag: z.string().optional(),
      attribute: z.string().optional(),
      gt: z.number().optional(),
      adjacentToType: z.string().optional(),
    }),
  }),
  z.object({
    op: z.literal('TRAVERSE'),
    fromId: z.string(),
    edgeType: z.string().optional(),
    maxDepth: z.number().int().positive().default(1),
  }),
  z.object({
    op: z.literal('AGGREGATE'),
    semanticType: z.string(),
    attribute: z.string(),
    fn: z.enum(['count', 'sum', 'avg']),
  }),
  z.object({
    op: z.literal('SEARCH'),
    text: z.string().min(1),
  }),
]);

export type QueryAst = z.infer<typeof QueryAstSchema>;

export interface QueryResult {
  readonly ids: readonly string[];
  readonly objects: readonly QueryableObject[];
  readonly aggregate?: number;
}

function attrNumber(obj: QueryableObject, key: string): number | undefined {
  const v = obj.attributes?.[key];
  return typeof v === 'number' ? v : undefined;
}

export function executeQuery(graph: IndexedSemanticGraph, ast: QueryAst): QueryResult {
  switch (ast.op) {
    case 'QUERY': {
      let ids = graph.all().map((o) => o.id);
      if (ast.semanticType) ids = ids.filter((id) => graph.get(id)?.semanticType === ast.semanticType);
      if (ast.tag) ids = ids.filter((id) => graph.idsByTag(ast.tag!).includes(id));
      if (ast.capability) ids = ids.filter((id) => graph.idsByCapability(ast.capability!).includes(id));
      return { ids, objects: ids.map((id) => graph.get(id)!) };
    }
    case 'FILTER': {
      const objects = graph.all().filter((obj) => {
        if (ast.where.semanticType && obj.semanticType !== ast.where.semanticType) return false;
        if (ast.where.tag && !(obj.tags ?? []).includes(ast.where.tag)) return false;
        if (ast.where.attribute && ast.where.gt !== undefined) {
          const n = attrNumber(obj, ast.where.attribute);
          if (n === undefined || !(n > ast.where.gt)) return false;
        }
        if (ast.where.adjacentToType) {
          const ok = (obj.edges ?? []).some((e) => {
            const target = graph.get(e.to);
            return target?.semanticType === ast.where.adjacentToType;
          });
          if (!ok) return false;
        }
        return true;
      });
      return { ids: objects.map((o) => o.id), objects };
    }
    case 'TRAVERSE': {
      const visited = new Set<string>();
      const queue: Array<{ id: string; depth: number }> = [{ id: ast.fromId, depth: 0 }];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur.id) || cur.depth > ast.maxDepth) continue;
        visited.add(cur.id);
        const obj = graph.get(cur.id);
        if (!obj) continue;
        for (const edge of obj.edges ?? []) {
          if (ast.edgeType && edge.type !== ast.edgeType) continue;
          queue.push({ id: edge.to, depth: cur.depth + 1 });
        }
      }
      visited.delete(ast.fromId);
      const ids = [...visited].sort();
      return { ids, objects: ids.map((id) => graph.get(id)!).filter(Boolean) };
    }
    case 'AGGREGATE': {
      const objs = graph.all().filter((o) => o.semanticType === ast.semanticType);
      if (ast.fn === 'count') {
        return { ids: objs.map((o) => o.id), objects: objs, aggregate: objs.length };
      }
      const nums = objs
        .map((o) => attrNumber(o, ast.attribute))
        .filter((n): n is number => n !== undefined);
      const sum = nums.reduce((a, b) => a + b, 0);
      const aggregate = ast.fn === 'sum' ? sum : nums.length === 0 ? 0 : sum / nums.length;
      return { ids: objs.map((o) => o.id), objects: objs, aggregate };
    }
    case 'SEARCH': {
      const q = ast.text.toLowerCase();
      const objects = graph.all().filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.semanticType.toLowerCase().includes(q) ||
          (o.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
      return { ids: objects.map((o) => o.id), objects };
    }
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}
