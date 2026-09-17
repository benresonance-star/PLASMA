import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainCamera} from '../demo/navigation.mjs';
import {demoTerrain} from '../demo/fixture.mjs';
test('camera navigation changes projection without modifying terrain',()=>{
  const source=structuredClone(demoTerrain),c=createTerrainCamera(source.points),p=source.points[0],initial=c.project(p);
  c.orbit(40,20);assert.notDeepEqual(c.project(p),initial);c.pan(30,-20);c.zoomAt(2);
  assert.deepEqual(source,demoTerrain);c.reset();assert.deepEqual(c.project(p),initial);
});
test('panning translates every projected point equally',()=>{
  const c=createTerrainCamera(demoTerrain.points),before=demoTerrain.points.map(p=>c.project(p));c.pan(30,-20);
  demoTerrain.points.forEach((p,i)=>{const after=c.project(p);assert.ok(Math.abs(after.x-before[i].x-30)<1e-9);assert.ok(Math.abs(after.y-before[i].y+20)<1e-9);});
});
test('zoom keeps the point beneath the cursor fixed',()=>{
  const c=createTerrainCamera(demoTerrain.points),p=demoTerrain.points[7],before=c.project(p);c.zoomAt(2,before.x,before.y);
  const after=c.project(p);assert.ok(Math.abs(before.x-after.x)<1e-9);assert.ok(Math.abs(before.y-after.y)<1e-9);
});
test('zoom and pole limits remain bounded over extreme input',()=>{
  const c=createTerrainCamera(demoTerrain.points);c.zoomAt(1e9);assert.equal(c.state().zoom,20);c.zoomAt(1e-9);assert.equal(c.state().zoom,.15);
  c.orbit(1e6,1e6);assert.ok(c.state().pitch<Math.PI/2);assert.ok(Object.values(c.project(demoTerrain.points[0])).every(Number.isFinite));
});
