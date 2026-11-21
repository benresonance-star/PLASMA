import { describe,expect,it } from 'vitest';
import { fitHotelLocalCapture, type SiteControl } from './hotel-site.js';
import { buildServer } from './server.js';

function fourControls():SiteControl[]{
  const theta=Math.PI/9,c=Math.cos(theta),s=Math.sin(theta);
  return [[0,0,0],[2000,0,0],[0,1700,120],[1100,900,350]].map((p,i)=>({
    id:'marker-'+i, observedMm:p as [number,number,number],
    designMm:[c*p[0]!-s*p[1]!+12000,s*p[0]!+c*p[1]!+3500,p[2]!+125] as [number,number,number],
  }));
}
describe('F16 local capture grounding',()=>{
  it('solves a measured 20 degree yaw and XYZ offset without claiming survey status',()=>{
    const fit=fitHotelLocalCapture(fourControls());
    expect(fit.kind).toBe('local-yaw-rigid-fit');
    expect(fit.yawDeg).toBeCloseTo(20,8);
    expect(fit.translationMm[0]).toBeCloseTo(12000,8);
    expect(fit.translationMm[1]).toBeCloseTo(3500,8);
    expect(fit.translationMm[2]).toBeCloseTo(125,8);
    expect(fit.rmsResidualMm).toBeLessThan(1e-8);
    expect(fit.surveyCertified).toBe(false);
    expect(fit.spatialStatus).toBe('local-fit-unverified');
  });
  it('refuses underdetermined, duplicate and degenerate control points',()=>{
    expect(()=>fitHotelLocalCapture(fourControls().slice(0,3)))
      .toThrow(/REQUIRES_4/);
    const c=fourControls();
    expect(()=>fitHotelLocalCapture([c[0]!,c[0]!,c[2]!,c[3]!]))
      .toThrow(/DUPLICATE/);
    expect(()=>fitHotelLocalCapture(Array.from({length:4},(_,i)=>({
      id:'control'+i,observedMm:[0,0,0] as const,
      designMm:[i,0,0] as const,
    })))).toThrow(/DEGENERATE/);
  });
});
describe('F16 persistent site evidence',()=>{
  it('saves a local-fit observation in one optimistic concurrency event, but does not claim it is a surveyed site or rendered splat',async()=>{
    const {app,store}=buildServer();
    const made=await app.inject({method:'POST',url:'/models',payload:{name:'Hotel + Capture'}});
    const {model,branchId,headHash}=made.json() as{
      model:{modelId:string};branchId:string;headHash:string;
    };
    const base='/models/'+model.modelId+'/hotels/riverside';
    const bootstrap=await app.inject({method:'POST',url:'/models/'+model.modelId+'/hotels/bootstrap',
      payload:{branchId,expectedHeadHash:headHash}});
    expect(bootstrap.statusCode,bootstrap.body).toBe(201);
    const originalHead=bootstrap.json().headHash as string;
    const payload={
      branchId,expectedHeadHash:originalHead,
      hotelId:'entity:hotel:riverside-168',
      observation:{
        captureId:'drone-2026-001',name:'Street survey markers / reference capture',
        mediaKind:'drone',capturedAt:'2026-11-22T00:00:00Z',
        mediaRef:'library:drone-2026-001',
        provenance:'user-supplied',controls:fourControls(),
      },
    };
    const saved=await app.inject({method:'POST',url:base+'/site-observations',payload});
    expect(saved.statusCode,saved.body).toBe(201);
    expect(saved.json().surveyCertified).toBe(false);
    expect(saved.json().gaussianRendered).toBe(false);
    expect(saved.json().fit.rmsResidualMm).toBeLessThan(1e-8);
    const received=await app.inject({method:'GET',
      url:base+'/site-observations?branchId='+encodeURIComponent(branchId)});
    expect(received.statusCode).toBe(200);
    expect(received.json().observations).toHaveLength(1);
    expect(received.json().observations[0].metadata.contract)
      .toBe('plasma.hotel-site-observation/0.1');
    const stale=await app.inject({method:'POST',url:base+'/site-observations',payload});
    expect(stale.statusCode).toBe(409);
    expect((await store.listEvents(branchId))
      .filter(e=>e.command==='UPDATE'||e.command==='CREATE').length).toBeGreaterThan(0);
    await app.close();
  });
});
