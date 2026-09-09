import { describe, expect, it } from 'vitest';
import {
  D01_TOPOLOGY_POLICY,
  extractYNetwork,
  generateD01Topology,
} from '@spds/topology-operators';
import { compileRequestDigest } from '@spds/geometry-contracts';
import { mapYNetworkToCompileRequest } from './compile-mapper.js';

describe('mapYNetworkToCompileRequest', () => {
  it('keeps owners stable when length changes', () => {
    const topo = generateD01Topology();
    const yNetwork = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
    const a = mapYNetworkToCompileRequest({
      yNetwork,
      pirHash: 'pir:test',
      dagHash: 'dag:test',
      yLimit: 3,
      lengthMm: 2300,
    });
    const b = mapYNetworkToCompileRequest({
      yNetwork,
      pirHash: 'pir:test',
      dagHash: 'dag:test',
      yLimit: 3,
      lengthMm: 2500,
    });
    expect(a.ops.map((o) => o.semanticOwner)).toEqual(b.ops.map((o) => o.semanticOwner));
    expect(compileRequestDigest(a)).not.toBe(compileRequestDigest(b));
    expect(a.parameters.lengthMm).toBe(2300);
    expect(b.parameters.lengthMm).toBe(2500);
    expect(a.ops).toHaveLength(9);
    expect(new Set(a.ops.map((op) => `${op.semanticOwner}/${op.featurePath}`)).size).toBe(9);
    expect(a.ops.slice(0, 3).map((op) => op.featurePath)).toEqual(['arm:A', 'arm:B', 'arm:C']);
    expect(a.ops.slice(0, 3).every((op) => op.profileUp?.length === 3)).toBe(true);
    const firstComponentEnds = a.ops.slice(0, 3).map((op) => op.path[1]);
    expect(new Set(firstComponentEnds.map((point) => JSON.stringify(point))).size).toBe(3);
  });

  it('benchmarks 600 tri-arm sweep ops under 10ms', () => {
    const topo = generateD01Topology();
    const yNetwork = extractYNetwork(topo, D01_TOPOLOGY_POLICY.diameterMm);
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) {
      mapYNetworkToCompileRequest({
        yNetwork,
        pirHash: 'pir:test',
        dagHash: 'dag:test',
        yLimit: 5,
        lengthMm: 2300 + i,
      });
    }
    expect(performance.now() - t0).toBeLessThan(10);
  });
});
