import { describe,it,expect } from 'vitest';
import { buildWetCore,assessWetCore,traceConnectedPorts,compareWetCoreChange } from './index.js';

describe('TH-01 wet-core semantic engineering benchmark', () => {
  const make=()=>buildWetCore();
  it('creates real typed assemblies, ports, directed routes and physical fittings with stable IDs',()=>{
    const model=make();
    expect(model.components.length).toBeGreaterThanOrEqual(12);
    expect(model.ports.length).toBeGreaterThan(28);
    expect(model.runs.length).toBeGreaterThan(16);
    expect(model.fittings.length).toBeGreaterThan(18);
    expect(model.structure.filter(x=>x.kind==='joist').length).toBe(9);
    expect(model.structure.filter(x=>x.kind==='stud').length).toBeGreaterThan(8);
    expect(model.components.find(c=>c.id==='bath-basin')?.portIds)
      .toEqual(['bath-basin:cold','bath-basin:hot','bath-basin:waste']);
    expect(model.committed).toBe(false);
  });
  it('connects all fixtures to their supply sources and downstream outfall',()=>{
    const model=make();
    expect(traceConnectedPorts(model,'meter:out')).toContain('bath-basin:cold');
    expect(traceConnectedPorts(model,'hpwh:out')).toContain('bath-basin:hot');
    expect(traceConnectedPorts(model,'bath-basin:waste')).toContain('stack:out');
    expect(traceConnectedPorts(model,'bath-shower:waste')).toContain('stack:out');
    expect(assessWetCore(model).connectedFixtureCount).toBe(5);
  });
  it('never claims engineering approval and reports unresolved real component/fitting review',()=>{
    const result=assessWetCore(make());
    expect(result.engineeringStatus).toBe('not-verified');
    expect(result.committed).toBe(false);
    expect(result.issues.some(i=>i.code==='UNVERIFIED_FITTING'&&i.severity==='review')).toBe(true);
    expect(result.issues.some(i=>i.code==='NEEDS_ENGINEERING_REVIEW')).toBe(true);
    expect(result.materialLengthMm['copper-press']).toBeGreaterThan(10000);
    expect(result.materialLengthMm['pvc-dwv']).toBeGreaterThan(3000);
  });
  it('moving basin changes only its assembly, trap, and corresponding dependent runs',()=>{
    const a=make(),b=buildWetCore({basinShiftMm:400});
    const diff=compareWetCoreChange(a,b);
    expect(diff.modifiedComponentIds).toContain('bath-basin');
    expect(diff.modifiedComponentIds).toContain('basin-trap');
    expect(diff.modifiedComponentIds).not.toContain('bath-wc');
    expect(diff.modifiedRunIds).toContain('basin-branch');
    expect(diff.modifiedRunIds).toContain('cold-basin');
    expect(diff.modifiedRunIds).toContain('hot-basin');
    expect(diff.modifiedRunIds).not.toContain('cold-shower');
    expect(diff.addedIds).toEqual([]);
    expect(diff.removedIds).toEqual([]);
    expect(assessWetCore(b).connectedFixtureCount).toBe(5);
  });
  it('detects invalid fall and disconnected fixture without silently improving numbers',()=>{
    const base=make();
    const badRuns=base.runs.map(r=>r.id==='basin-branch'
      ? {...r,pointsMm:[r.pointsMm[0]!,[3400,700,3500],...r.pointsMm.slice(2)]}
      : r).filter(r=>r.id!=='cold-basin');
    const broken={...base,runs:badRuns};
    const res=assessWetCore(broken);
    expect(res.issues.some(i=>i.code==='UNSUPPORTED_GRADIENT')).toBe(true);
    expect(res.issues.some(i=>i.code==='DISCONNECTED_SUPPLY'&&i.ownerId==='bath-basin')).toBe(true);
    expect(res.connectedFixtureCount).toBe(4);
  });
  it('detects real clearance interference with floor structure',()=>{
    const model=make();
    const r=model.runs.find(x=>x.id==='basin-branch')!;
    const framing={id:'test:joist',kind:'joist' as const,minMm:[3300,1590,2990] as const,
      maxMm:[3430,1700,3190] as const,structural:true};
    const res=assessWetCore({...model,structure:[...model.structure,framing]});
    expect(res.issues.some(i=>i.code==='STRUCTURAL_INTERFERENCE'&&i.relatedIds.includes('test:joist')))
      .toBe(true);
    expect(r.pointsMm.length).toBeGreaterThan(2);
  });
  it('rejects silent dimension changes outside the defined parametric domain',()=>{
    expect(()=>buildWetCore({basinShiftMm:1000})).toThrow();
    expect(make()).toEqual(make());
  });
});
