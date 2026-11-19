import { describe, it, expect } from 'vitest';
import { proposeServiceNetwork } from '@spds/services-network-core';
import { houseScenario } from './scenario.js';

describe('house-wide geometric services routing demonstration', () => {
  it('creates 10 distinct fixture runs', () => {
    const input = houseScenario({ water: true, electrical: true, obstruction: true });
    expect(input.runs).toHaveLength(10);
    expect(new Set(input.runs.map((r) => r.id)).size).toBe(10);
  });
  it('routes fixture runs and reports every unresolved issue', () => {
    const result = proposeServiceNetwork(houseScenario({ water: true, electrical: true, obstruction: true }));
    expect(result.routes).toHaveLength(10);
    expect(result.routes.every((r) => r.engineeringStatus === 'not-verified')).toBe(true);
    expect(result.committed).toBe(false);
    expect(result.routes.some((r) => r.routingMethod === 'rerouted')).toBe(true);
    expect(result.routes.every((r) => r.status === 'proposed' || r.issues.length > 0)).toBe(true);
  });
  it('can reroute after a structural change', () => {
    const plain = proposeServiceNetwork(houseScenario({ water: true, electrical: false, obstruction: false }));
    const withBeam = proposeServiceNetwork(houseScenario({ water: true, electrical: false, obstruction: true }));
    expect(withBeam).not.toEqual(plain);
    expect(withBeam.routes.find((r) => r.id === 'Kitchen sink')?.routingMethod).toBe('rerouted');
  });
});
