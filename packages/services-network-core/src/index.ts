/** Deterministic, non-authoritative building-services routing proposals.
 * All coordinates and sizes are millimetres. No engineering compliance is asserted.
 */
export type Point3 = readonly [number, number, number];
export type ServiceKind = 'water' | 'electrical' | 'hvac' | 'drainage' | 'gas';
export interface Box3 { readonly id: string; readonly min: Point3; readonly max: Point3; readonly semanticOwnerId?: string; }
export interface ServiceRunRequest {
  readonly id: string; readonly system: ServiceKind;
  readonly source: Point3; readonly destination: Point3;
  readonly nominalDiameterMm: number; readonly clearanceMm: number;
  readonly minServiceSeparationMm: number; readonly semanticOwnerId: string;
}
export interface RoutingProblem {
  readonly envelope: Box3; readonly obstructions: readonly Box3[];
  readonly runs: readonly ServiceRunRequest[]; readonly gridStepMm: number;
  readonly bendPenaltyMm?: number; readonly verticalPenalty?: number;
  readonly maxExpandedNodes?: number;
}
export type RouteIssueCode =
  | 'UNSUPPORTED_ENGINEERING_SYSTEM'
  | 'SOURCE_OR_DESTINATION_BLOCKED'
  | 'NO_COLLISION_FREE_ROUTE'
  | 'ROUTING_SEARCH_LIMIT';
export interface RouteIssue {
  readonly code: RouteIssueCode; readonly message: string;
  readonly obstructionIds: readonly string[];
}
export interface ProposedServiceRoute {
  readonly id: string; readonly system: ServiceKind; readonly semanticOwnerId: string;
  readonly status: 'proposed' | 'blocked'; readonly points: readonly Point3[];
  readonly lengthMm: number; readonly bendCount: number;
  readonly initialClashCount: number; readonly finalClashCount: number;
  readonly routingMethod: 'direct' | 'rerouted' | 'unavailable';
  readonly issues: readonly RouteIssue[];
  readonly engineeringStatus: 'not-verified'; readonly requiresHumanApproval: true;
}
export interface ServiceNetworkProposal {
  readonly kind: 'services-network-proposal/v0.1';
  readonly routes: readonly ProposedServiceRoute[];
  readonly obstructionCount: number; readonly initialClashCount: number;
  readonly resolvedClashCount: number; readonly unresolvedRunCount: number;
  readonly committed: false; readonly evidence: readonly string[];
}
interface OccupiedSegment {
  readonly id: string; readonly a: Point3; readonly b: Point3;
  readonly radiusMm: number; readonly separationMm: number;
}
const DIRECTIONS: readonly Point3[] = [
  [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const routable = new Set<ServiceKind>(['water', 'electrical']);

function assertBox(box: Box3): void {
  if (!box.id || box.min.length !== 3 || box.max.length !== 3 ||
      !box.min.every(Number.isFinite) || !box.max.every(Number.isFinite) ||
      box.min.some((v, i) => v >= box.max[i]!)) throw new Error('Invalid bounding box: ' + box.id);
}
function validate(input: RoutingProblem): void {
  assertBox(input.envelope);
  const step = input.gridStepMm;
  if (!Number.isFinite(step) || step <= 0) throw new Error('gridStepMm must be positive and finite');
  if (!Number.isFinite(input.bendPenaltyMm ?? 0) || (input.bendPenaltyMm ?? 0) < 0 ||
      !Number.isFinite(input.verticalPenalty ?? 1) || (input.verticalPenalty ?? 1) < 0)
    throw new Error('Invalid search penalty');
  if (input.maxExpandedNodes !== undefined &&
      (!Number.isInteger(input.maxExpandedNodes) || input.maxExpandedNodes <= 0))
    throw new Error('maxExpandedNodes must be positive');
  const obstacleIds = new Set<string>();
  for (const box of input.obstructions) {
    assertBox(box);
    if (obstacleIds.has(box.id)) throw new Error('Duplicate obstruction id: ' + box.id);
    obstacleIds.add(box.id);
  }
  const runIds = new Set<string>();
  for (const run of input.runs) {
    if (!run.id || !run.semanticOwnerId || runIds.has(run.id))
      throw new Error('Invalid or duplicate run id: ' + run.id);
    runIds.add(run.id);
    if (run.source.length !== 3 || run.destination.length !== 3 ||
        !run.source.every(Number.isFinite) || !run.destination.every(Number.isFinite))
      throw new Error('Invalid run endpoints: ' + run.id);
    if (![run.nominalDiameterMm, run.clearanceMm, run.minServiceSeparationMm]
      .every((n) => Number.isFinite(n) && n >= 0) || run.nominalDiameterMm === 0)
      throw new Error('Invalid run size or clearance: ' + run.id);
    for (const point of [run.source, run.destination]) {
      for (let axis = 0; axis < 3; axis++) {
        const cell = (point[axis]! - input.envelope.min[axis]!) / step;
        if (Math.abs(cell - Math.round(cell)) > 1e-7)
          throw new Error('Route ' + run.id + ' endpoints must align with gridStepMm lattice');
      }
    }
  }
}

function intersects(a: Point3, b: Point3, box: Box3, growth: number): boolean {
  let enter = 0;
  let leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const low = box.min[axis]! - growth;
    const high = box.max[axis]! + growth;
    const delta = b[axis]! - a[axis]!;
    if (Math.abs(delta) < 1e-10) {
      if (a[axis]! < low || a[axis]! > high) return false;
    } else {
      const u = (low - a[axis]!) / delta;
      const v = (high - a[axis]!) / delta;
      enter = Math.max(enter, Math.min(u, v));
      leave = Math.min(leave, Math.max(u, v));
      if (enter > leave) return false;
    }
  }
  return true;
}
function between(a: Point3, b: Point3, inflation: number, id: string): Box3 {
  return {
    id,
    min: [Math.min(a[0], b[0]) - inflation,
      Math.min(a[1], b[1]) - inflation, Math.min(a[2], b[2]) - inflation],
    max: [Math.max(a[0], b[0]) + inflation,
      Math.max(a[1], b[1]) + inflation, Math.max(a[2], b[2]) + inflation],
  };
}
export function detectServiceClashes(
  points: readonly Point3[], run: ServiceRunRequest,
  input: Pick<RoutingProblem, 'envelope' | 'obstructions'>,
  occupied: readonly OccupiedSegment[] = [],
): string[] {
  const result = new Set<string>();
  const radius = run.nominalDiameterMm / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.filter((v, k) => v !== b[k]).length > 1)
      throw new Error('Only orthogonal route segments are supported');
    for (const p of [a, b]) {
      if (p.some((v, k) =>
        v - radius < input.envelope.min[k]! || v + radius > input.envelope.max[k]!))
        result.add('envelope:' + input.envelope.id);
    }
    for (const obstacle of input.obstructions) {
      if (intersects(a, b, obstacle, radius + run.clearanceMm)) result.add(obstacle.id);
    }
    for (const earlier of occupied) {
      const inflation = radius + earlier.radiusMm +
        Math.max(run.minServiceSeparationMm, earlier.separationMm);
      if (intersects(a, b, between(earlier.a, earlier.b, inflation, earlier.id), 0))
        result.add(earlier.id);
    }
  }
  return [...result].sort();
}
function compress(points: readonly Point3[]): Point3[] {
  const result: Point3[] = [];
  for (const point of points) {
    if (result.length && point.every((v, k) => v === result[result.length - 1]![k])) continue;
    while (result.length > 1) {
      const a = result[result.length - 2]!;
      const b = result[result.length - 1]!;
      if (!a.every((v, k) => Math.sign(b[k]! - v) === Math.sign(point[k]! - b[k]!))) break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}
function length(points: readonly Point3[]): number {
  return points.slice(1).reduce((n, b, i) => {
    const a = points[i]!;
    return n + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }, 0);
}
function bends(points: readonly Point3[]): number {
  let count = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!, b = points[i - 1]!, c = points[i]!;
    if (a.some((v, k) => Math.sign(b[k]! - v) !== Math.sign(c[k]! - b[k]!))) count++;
  }
  return count;
}
function permutations(a: Point3, b: Point3): Point3[][] {
  const axes = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  return axes.map((order) => {
    const position = [...a] as [number, number, number];
    const points: Point3[] = [a];
    for (const axis of order) {
      position[axis] = b[axis]!;
      points.push([...position] as Point3);
    }
    return compress(points);
  });
}
interface Node {
  readonly key: string; readonly at: Point3; readonly direction: number;
  readonly g: number; readonly h: number; readonly f: number;
  readonly parent?: string; readonly serial: number;
}
class Heap {
  private readonly values: Node[] = [];
  get size(): number { return this.values.length; }
  private less(a: Node, b: Node): boolean {
    return a.f !== b.f ? a.f < b.f : a.h !== b.h ? a.h < b.h : a.serial < b.serial;
  }
  add(node: Node): void {
    const a = this.values;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(node, a[p]!)) break;
      a[i] = a[p]!;
      i = p;
    }
    a[i] = node;
  }
  take(): Node | undefined {
    const a = this.values, first = a[0], last = a.pop();
    if (a.length && last) {
      let i = 0;
      while (2 * i + 1 < a.length) {
        let k = 2 * i + 1;
        if (k + 1 < a.length && this.less(a[k + 1]!, a[k]!)) k++;
        if (!this.less(a[k]!, last)) break;
        a[i] = a[k]!;
        i = k;
      }
      a[i] = last;
    }
    return first;
  }
}
function routeAStar(
  run: ServiceRunRequest, input: RoutingProblem, occupied: readonly OccupiedSegment[],
): { readonly path: Point3[] | null; readonly budgetExceeded: boolean } {
  const step = input.gridStepMm, origin = input.envelope.min;
  const maxCell = input.envelope.max.map((v, k) => Math.floor((v - origin[k]!) / step));
  const key = (p: Point3, direction: number): string => p.join(',') + ':' + direction;
  const distance = (p: Point3): number => p.reduce((n, v, k) =>
    n + Math.abs(v - run.destination[k]!), 0);
  const start: Node = { key: key(run.source, -1), at: run.source, direction: -1,
    g: 0, h: distance(run.source), f: distance(run.source), serial: 0 };
  const open = new Heap(), best = new Map<string, Node>(), closed = new Set<string>();
  open.add(start);
  best.set(start.key, start);
  let serial = 1, expanded = 0;
  const limit = input.maxExpandedNodes ?? 50000;
  while (open.size) {
    const node = open.take()!;
    if (closed.has(node.key) || best.get(node.key) !== node) continue;
    if (node.at.every((v, k) => v === run.destination[k])) {
      const path: Point3[] = [];
      let cursor: Node | undefined = node;
      while (cursor) {
        path.push(cursor.at);
        cursor = cursor.parent ? best.get(cursor.parent) : undefined;
      }
      return { path: compress(path.reverse()), budgetExceeded: false };
    }
    if (++expanded > limit) return { path: null, budgetExceeded: true };
    closed.add(node.key);
    for (let dir = 0; dir < 6; dir++) {
      const d = DIRECTIONS[dir]!;
      const point: Point3 = [
        node.at[0] + d[0] * step, node.at[1] + d[1] * step, node.at[2] + d[2] * step,
      ];
      if (point.some((v, k) => {
        const cell = Math.round((v - origin[k]!) / step);
        return cell < 0 || cell > maxCell[k]!;
      })) continue;
      if (detectServiceClashes([node.at, point], run, input, occupied).length) continue;
      const nextKey = key(point, dir);
      if (closed.has(nextKey)) continue;
      const bend = node.direction < 0 || node.direction === dir ? 0 : (input.bendPenaltyMm ?? step);
      const vertical = dir >= 4 ? step * (input.verticalPenalty ?? 1) : 0;
      const g = node.g + step + bend + vertical;
      if ((best.get(nextKey)?.g ?? Infinity) <= g) continue;
      const h = distance(point);
      const next: Node = { key: nextKey, at: point, direction: dir,
        g, h, f: g + h, parent: node.key, serial: serial++ };
      open.add(next);
      best.set(nextKey, next);
    }
  }
  return { path: null, budgetExceeded: false };
}

export function proposeServiceNetwork(input: RoutingProblem): ServiceNetworkProposal {
  validate(input);
  const occupied: OccupiedSegment[] = [], routes: ProposedServiceRoute[] = [];
  let initialClashes = 0, resolvedClashes = 0;
  for (const run of input.runs) {
    const identity = { id: run.id, system: run.system, semanticOwnerId: run.semanticOwnerId,
      engineeringStatus: 'not-verified' as const, requiresHumanApproval: true as const };
    const blocked = (
      code: RouteIssueCode, message: string, ids: readonly string[], initial = 0,
      final = 0,
    ): ProposedServiceRoute => ({
      ...identity, status: 'blocked', points: [], lengthMm: 0, bendCount: 0,
      initialClashCount: initial, finalClashCount: final, routingMethod: 'unavailable',
      issues: [{ code, message, obstructionIds: ids }],
    });
    if (!routable.has(run.system)) {
      routes.push(blocked('UNSUPPORTED_ENGINEERING_SYSTEM',
        run.system + ' requires a specialist design and engineering solver', []));
      continue;
    }
    const hitsAtStart = detectServiceClashes([run.source, run.source], run, input, occupied);
    const hitsAtEnd = detectServiceClashes([run.destination, run.destination], run, input, occupied);
    if (hitsAtStart.length || hitsAtEnd.length) {
      routes.push(blocked('SOURCE_OR_DESTINATION_BLOCKED',
        'A route endpoint is inside a keep-out or clearance exclusion',
        [...new Set([...hitsAtStart, ...hitsAtEnd])].sort(),
        hitsAtStart.length + hitsAtEnd.length, hitsAtStart.length + hitsAtEnd.length));
      continue;
    }
    const candidates = permutations(run.source, run.destination);
    const primaryHits = detectServiceClashes(candidates[0]!, run, input, occupied);
    initialClashes += primaryHits.length;
    const available = candidates.filter((points) =>
      detectServiceClashes(points, run, input, occupied).length === 0);
    available.sort((a, b) =>
      (length(a) + bends(a) * (input.bendPenaltyMm ?? input.gridStepMm)) -
      (length(b) + bends(b) * (input.bendPenaltyMm ?? input.gridStepMm)));
    let points: Point3[] | null = available[0] ?? null;
    let exceeded = false;
    if (!points) {
      const search = routeAStar(run, input, occupied);
      points = search.path;
      exceeded = search.budgetExceeded;
    }
    const after = points ? detectServiceClashes(points, run, input, occupied) : [];
    if (!points || after.length) {
      routes.push(blocked(exceeded ? 'ROUTING_SEARCH_LIMIT' : 'NO_COLLISION_FREE_ROUTE',
        exceeded ? 'A* route search exhausted its budget' : 'No collision-free orthogonal route found',
        primaryHits, primaryHits.length, after.length));
      continue;
    }
    if (primaryHits.length) resolvedClashes += primaryHits.length;
    routes.push({ ...identity, status: 'proposed', points, lengthMm: length(points),
      bendCount: bends(points), initialClashCount: primaryHits.length, finalClashCount: 0,
      routingMethod: primaryHits.length ? 'rerouted' : 'direct', issues: [] });
    for (let k = 1; k < points.length; k++) {
      occupied.push({ id: 'route:' + run.id, a: points[k - 1]!, b: points[k]!,
        radiusMm: run.nominalDiameterMm / 2, separationMm: run.minServiceSeparationMm });
    }
  }
  return { kind: 'services-network-proposal/v0.1', routes,
    obstructionCount: input.obstructions.length, initialClashCount: initialClashes,
    resolvedClashCount: resolvedClashes,
    unresolvedRunCount: routes.filter((r) => r.status === 'blocked').length,
    committed: false,
    evidence: [
      'Orthogonal candidate centreline segments checked against conservative inflated AABB obstacles and previously routed services.',
      'Results are indicative geometric clearances only. User-supplied obstruction geometry and endpoint quality determine validity.',
      'No HVAC sizing, flow/pressure, drainage fall, gas or electrical load/code verification performed.',
      'Human review, independent engineering verification, and an explicit authoritative transaction are required.',
    ],
  };
}
export function serviceRouteSegments(proposal: ServiceNetworkProposal): readonly {
  readonly id: string; readonly system: ServiceKind; readonly ownerId: string;
  readonly a: Point3; readonly b: Point3;
}[] {
  return proposal.routes.filter((r) => r.status === 'proposed').flatMap((route) =>
    route.points.slice(1).map((b, i) => ({
      id: route.id + ':segment:' + i, system: route.system,
      ownerId: route.semanticOwnerId, a: route.points[i]!, b,
    })));
}
