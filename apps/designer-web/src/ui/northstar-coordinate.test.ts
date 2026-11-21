import { describe, expect, it } from 'vitest';
import { cadZUpMeshesToViewportYUp } from './northstar-coordinate.js';

describe('Northstar Loft/OpenCascade source-to-viewer coordinate contract', () => {
  it('makes a source Z-vertical wall Y-vertical without changing source geometry or identity', () => {
    const source = [{
      representationId: 'repr:occt:wall', semanticOwner: 'entity:wall',
      vertices: [[10, 20, 30], [80, 20, 30], [10, 20, 2800]] as
        readonly (readonly [number,number,number])[],
      indices: [0, 1, 2],
    }];
    const original = JSON.stringify(source);
    const [converted] = cadZUpMeshesToViewportYUp(source);
    expect(converted!.vertices).toEqual([
      [10, 30, -20], [80, 30, -20], [10, 2800, -20],
    ]);
    expect(converted!.representationId).toBe('repr:occt:wall');
    expect(converted!.semanticOwner).toBe('entity:wall');
    expect(converted!.indices).toEqual([0,1,2]);
    expect(JSON.stringify(source)).toBe(original);
  });
  it('preserves Euclidean lengths and signed triangle orientation under a proper rotation', () => {
    const mesh = {
      representationId:'repr:1',semanticOwner:'entity:1',
      vertices:[[0,0,0],[1,0,0],[0,1,0]] as
        readonly (readonly [number,number,number])[],
      indices:[0,1,2],
    };
    const [converted] = cadZUpMeshesToViewportYUp([mesh]);
    const a=converted!.vertices[1]!,b=converted!.vertices[2]!;
    const cross:[number,number,number]=[
      a[1]*b[2]-a[2]*b[1],
      a[2]*b[0]-a[0]*b[2],
      a[0]*b[1]-a[1]*b[0],
    ];
    expect(cross).toEqual([0,1,0]);
    expect(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]).toBe(1);
  });
});
