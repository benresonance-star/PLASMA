import { describe, expect, it } from 'vitest';
import { proposeServiceNetwork, detectServiceClashes, serviceRouteSegments, type ServiceRunRequest, type RoutingProblem } from './index.js';

const water: ServiceRunRequest = {
  id: 'water:sink', system: 'water', semanticOwnerId: 'fixture:sink',
  source: [250,500,500], destination: [3250,500,500],
  nominalDiameterMm: 25, clearanceMm: 50, minServiceSeparationMm: 50,
};
const sample = (overrides: Partial<RoutingProblem> = {}): RoutingProblem => ({
  envelope: { id: 'house', min: [0,0,0], max: [4000,2000,1500] },
  obstructions: [], runs: [water], gridStepMm: 250, ...overrides,
});
describe('non-authoritative services network v0.1', () => {
  it('routes a clear run without committing or implying engineering approval', () => {
    const result = proposeServiceNetwork(sample());
    expect(result.routes[0]).toMatchObject({
      status: 'proposed', routingMethod: 'direct', lengthMm: 3000, bendCount: 0,
      engineeringStatus: 'not-verified', requiresHumanApproval: true, finalClashCount: 0,
    });
    expect(result.committed).toBe(false);
    expect(serviceRouteSegments(result)).toHaveLength(1);
  });
  it('automatically detours around an obstruction and preserves input', () => {
    const input = sample({ obstructions: [
      { id: 'beam', min: [1500,0,0], max: [2000,1500,1250] },
    ] });
    const before = JSON.stringify(input);
    const result = proposeServiceNetwork(input);
    const route = result.routes[0]!;
    expect(route.status).toBe('proposed');
    expect(route.routingMethod).toBe('rerouted');
    expect(route.lengthMm).toBeGreaterThan(3000);
    expect(route.initialClashCount).toBeGreaterThan(0);
    expect(route.finalClashCount).toBe(0);
    expect(result.resolvedClashCount).toBeGreaterThan(0);
    expect(detectServiceClashes(route.points, water, input)).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('reports a blocked room-spanning wall without falsely passing', () => {
    const result = proposeServiceNetwork(sample({ obstructions: [
      { id: 'wall', min: [1500,0,0], max: [2000,2000,1500] },
    ] }));
    expect(result.routes[0]?.status).toBe('blocked');
    expect(result.routes[0]?.issues[0]?.code).toBe('NO_COLLISION_FREE_ROUTE');
    expect(result.unresolvedRunCount).toBe(1);
  });
  it('enforces cross-trade spacing at a crossing', () => {
    const electric: ServiceRunRequest = {
      ...water, id: 'circuit:lighting', system: 'electrical',
      semanticOwnerId: 'circuit:lighting',
      source: [1750,250,500], destination: [1750,1750,500],
    };
    const result = proposeServiceNetwork(sample({ runs: [water, electric] }));
    expect(result.routes[1]).toMatchObject({
      status: 'proposed', routingMethod: 'rerouted', finalClashCount: 0,
    });
  });
  it('blocks unsupported engineering systems and enforces a search budget', () => {
    const result = proposeServiceNetwork(sample({
      runs: (['hvac','drainage','gas'] as const).map((system) => ({
        ...water, system, id: system,
      })),
    }));
    expect(result.routes.every((r) => r.issues[0]?.code === 'UNSUPPORTED_ENGINEERING_SYSTEM')).toBe(true);
    const search = proposeServiceNetwork(sample({
      obstructions: [{ id: 'beam', min: [1500,0,0], max: [2000,1500,1250] }],
      maxExpandedNodes: 1,
    }));
    expect(search.routes[0]?.issues[0]?.code).toBe('ROUTING_SEARCH_LIMIT');
  });
  it('blocks invalid endpoints and returns deterministic results', () => {
    const input = sample({ obstructions: [
      { id: 'column', min: [0,0,0], max: [500,750,750] },
    ] });
    expect(proposeServiceNetwork(input).routes[0]?.issues[0]?.code)
      .toBe('SOURCE_OR_DESTINATION_BLOCKED');
    expect(() => proposeServiceNetwork(sample({ runs: [
      { ...water, source: [260,500,500] },
    ] }))).toThrow('align');
    expect(proposeServiceNetwork(input)).toEqual(proposeServiceNetwork(input));
  });
});
