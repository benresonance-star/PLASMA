import { describe,expect,it } from 'vitest';
import { makeHotelLoftSource,makeHotelManifest,makeHotelModule } from './hotel-project.js';
import { deriveHotelArchitectureDocuments } from './hotel-documents.js';

function sourceSet(width=1800,revision=0){
  return {
    window:makeHotelModule('window-a4',revision,width),
    standard:makeHotelModule('suite-standard',revision,width),
    accessible:makeHotelModule('suite-accessible',revision,width),
    corner:makeHotelModule('suite-corner',revision,width),
  };
}
describe('F14/F15 actual modular construction source',()=>{
  it('keeps an architectural podium, roof and readable bronze/stone facade in native-compatible Loft source features',()=>{
    const shell=makeHotelLoftSource('building-shell');
    expect(shell.parts.length).toBeGreaterThan(40);
    expect(shell.parts.some(p=>p.role==='roof-garden')).toBe(true);
    expect(shell.parts.some(p=>p.role==='canopy-edge')).toBe(true);
    expect(shell.parts.some(p=>p.role==='entrance')).toBe(true);
    const suite=makeHotelLoftSource('suite-corner');
    expect(suite.parts.some(p=>p.role==='flashing')).toBe(true);
    expect(suite.parts.some(p=>p.role==='reveal')).toBe(true);
    expect(suite.parts.some(p=>p.role==='facade-fin')).toBe(true);
    const window=makeHotelLoftSource('window-a4');
    expect(window.parts.some(p=>p.role==='thermal-break')).toBe(true);
    expect(window.parts.some(p=>p.role==='sash')).toBe(true);
    for(const p of [...shell.parts,...suite.parts,...window.parts]){
      expect(p.features).toHaveLength(2);
      expect(p.parameters.W).toBeGreaterThan(0);
      expect(p.parameters.H).toBeGreaterThan(0);
      expect(p.parameters.D).toBeGreaterThan(0);
    }
  });
  it('uses actual wet-area, sanitary, joinery and openings rather than one solid bathroom cuboid',()=>{
    const accessible=makeHotelLoftSource('suite-accessible');
    expect(accessible.parts.find(p=>p.id==='BathroomPod')).toBeUndefined();
    for(const role of ['wet-area','wet-wall','wet-screen','sanitary',
      'joinery','door','bed-base','soft-furnishing']){
      expect(accessible.parts.some(p=>p.role===role)).toBe(true);
    }
  });
});
describe('F18 associative drawing studies',()=>{
  it('maintains document IDs, room identity and 168-key schedule across window source change',()=>{
    const manifest=makeHotelManifest();
    const before=deriveHotelArchitectureDocuments(manifest,sourceSet());
    const after=deriveHotelArchitectureDocuments(manifest,sourceSet(2100,1));
    expect(before.registry.map(x=>x.id)).toEqual(after.registry.map(x=>x.id));
    expect(before.elevationHash).not.toBe(after.elevationHash);
    expect(before.junctionHash).not.toBe(after.junctionHash);
    expect(before.scheduleHash).not.toBe(after.scheduleHash);
    expect(before.elevationSvg).toContain('data-semantic-id=');
    expect(before.elevationSvg).toContain(manifest.rooms[0]!.id);
    expect(after.elevationSvg).toContain(manifest.rooms[0]!.id);
    expect(before.scheduleRows.reduce((n,x)=>n+x.quantity,0)).toBe(168);
    expect(after.scheduleRows.reduce((n,x)=>n+x.quantity,0)).toBe(168);
    expect(after.scheduleRows.every(x=>x.nominalWidthMm===2100)).toBe(true);
    expect(after.registry.every(x=>x.revision===1)).toBe(true);
    expect(after.issueStatus).toBe('study-not-for-construction');
    expect(after.junctionSvg).toContain('NOT FOR CONSTRUCTION');
  });
  it('fails closed when one dependent suite is inconsistent with the shared A4 definition',()=>{
    const sources=sourceSet();
    expect(()=>deriveHotelArchitectureDocuments(makeHotelManifest(),{
      ...sources,corner:makeHotelModule('suite-corner',1,2300),
    })).toThrow(/REVISIONS_DIVERGED/);
  });
});
