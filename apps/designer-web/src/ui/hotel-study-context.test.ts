import { describe,expect,it } from 'vitest';
import { buildDualEngineScene } from './three-scene.js';
import { createSyntheticHotelSurroundings } from './hotel-study-context.js';

describe('F21.1 design-only urban environment visual integrity',()=>{
  it('keeps synthetic streets and neighboring massing out of actual native model root, picking and geometry evidence',()=>{
    const stage=createSyntheticHotelSurroundings();
    expect(stage.name).toBe('synthetic-urban-context-display-only');
    expect(stage.userData.surveyCertified).toBe(false);
    expect(stage.children.length).toBeGreaterThan(25);
    for(const object of stage.children) {
      expect(object.userData.sourceKind).toBe('synthetic-context-not-surveyed');
      expect(object.userData.semanticId).toBeUndefined();
    }
    const scene=buildDualEngineScene([],[], 'candidate',true,true);
    const context=scene.scene.children.find(x=>x.name==='synthetic-urban-context-display-only');
    expect(context).toBeDefined();
    expect(scene.root.getObjectByName('synthetic-urban-context-display-only')).toBeUndefined();
    expect(scene.root.children).toHaveLength(1);
    const without=buildDualEngineScene([],[], 'candidate',true,false);
    expect(without.scene.children.some(x=>x.name==='synthetic-urban-context-display-only'))
      .toBe(false);
  });
});
