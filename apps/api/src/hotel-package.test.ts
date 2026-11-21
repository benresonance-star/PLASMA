import { describe,expect,it } from 'vitest';
import { buildServer } from './server.js';
import { exportHotelPackage, validateHotelPackage } from './hotel-package.js';
import { clearHotelCompilerCache } from './hotel-scene.js';

describe('F21 portable Loft subproject source roundtrip',()=>{
  it('exports, checks digest, and atomically reimports a changed 168-key hotel into a different Plasma model',async()=>{
    const {app,store}=buildServer();
    const a=await app.inject({method:'POST',url:'/models',payload:{name:'Hotel A'}});
    const first=a.json() as{model:{modelId:string};branchId:string;headHash:string};
    const baseA='/models/'+first.model.modelId+'/hotels';
    const bootstrap=await app.inject({method:'POST',url:baseA+'/bootstrap',
      payload:{branchId:first.branchId,expectedHeadHash:first.headHash}});
    expect(bootstrap.statusCode).toBe(201);
    const originalHead=bootstrap.json().headHash as string;
    const proposal=await app.inject({method:'POST',url:baseA+'/riverside/window-proposal',
      payload:{branchId:first.branchId,expectedHeadHash:originalHead,nextWidthMm:2100}});
    expect(proposal.statusCode).toBe(200);
    const reviewed=await app.inject({method:'POST',url:baseA+'/riverside/accept-reviewed-window',
      payload:{branchId:first.branchId,expectedHeadHash:originalHead,nextWidthMm:2100,
        candidateHash:proposal.json().candidateHash}});
    expect(reviewed.statusCode).toBe(200);
    const pkg=await exportHotelPackage(store,first.branchId);
    validateHotelPackage(pkg);
    expect(pkg.modules).toHaveLength(5);
    expect(pkg.manifest.rooms).toHaveLength(168);
    expect(pkg.modules.find(p=>p.id.endsWith('window-a4'))?.source.windowWidthMm).toBe(2100);
    const corrupted=structuredClone(pkg);
    (corrupted.modules[0]!.source as {sourceHash:string}).sourceHash='forged';
    expect(()=>validateHotelPackage(corrupted)).toThrow();
    const b=await app.inject({method:'POST',url:'/models',payload:{name:'Hotel B'}});
    const second=b.json() as{model:{modelId:string};branchId:string;headHash:string};
    const importResult=await app.inject({method:'POST',
      url:'/models/'+second.model.modelId+'/hotels/import-package',
      payload:{branchId:second.branchId,expectedHeadHash:second.headHash,package:pkg}});
    expect(importResult.statusCode,importResult.body).toBe(201);
    expect(importResult.json().moduleCount).toBe(5);
    expect(importResult.json().ifcVerified).toBe(false);
    const exportedAgain=await exportHotelPackage(store,second.branchId);
    expect(exportedAgain.contentHash).toBe(pkg.contentHash);
    expect(exportedAgain.modules.map(m=>m.source.sourceHash))
      .toEqual(pkg.modules.map(m=>m.source.sourceHash));
    const repeated=await app.inject({method:'POST',
      url:'/models/'+second.model.modelId+'/hotels/import-package',
      payload:{branchId:second.branchId,expectedHeadHash:importResult.json().headHash,
        package:pkg}});
    expect(repeated.statusCode).toBe(409);
    const tampered=await app.inject({method:'POST',
      url:'/models/'+second.model.modelId+'/hotels/import-package',
      payload:{branchId:second.branchId,expectedHeadHash:importResult.json().headHash,
        package:corrupted}});
    expect(tampered.statusCode).toBe(422);
    await app.close();
  },40000);
  it('builds 168 rooms with a bounded cache and a measurable scene buffer budget',async()=>{
    clearHotelCompilerCache();
    const {app}=buildServer();
    const created=await app.inject({method:'POST',url:'/models',payload:{name:'Performance Hotel'}});
    const p=created.json() as{model:{modelId:string};branchId:string;headHash:string};
    const boot=await app.inject({method:'POST',
      url:'/models/'+p.model.modelId+'/hotels/bootstrap',
      payload:{branchId:p.branchId,expectedHeadHash:p.headHash}});
    const start=performance.now();
    const scene=await app.inject({method:'POST',
      url:'/models/'+p.model.modelId+'/hotels/riverside/scene',
      payload:{branchId:p.branchId,expectedHeadHash:boot.json().headHash,
        selectedLevel:3,kernel:'exact-adapter',mode:'exterior'}});
    expect(scene.statusCode,scene.body.slice(0,500)).toBe(200);
    const metrics=scene.json().performance as{
      budgetPassed:boolean;vertexCount:number;approximateBufferBytes:number;
      roomInstances:number;cachedSourceVariants:number;uniqueSourceSolidCount:number;
    };
    expect(metrics.budgetPassed).toBe(true);
    expect(metrics.roomInstances).toBe(168);
    expect(metrics.uniqueSourceSolidCount).toBeGreaterThan(110);
    expect(metrics.cachedSourceVariants).toBeLessThanOrEqual(24);
    expect(metrics.approximateBufferBytes).toBeLessThan(64_000_000);
    expect(metrics.vertexCount).toBeGreaterThan(0);
    const timeMs=Math.round(performance.now()-start);
    console.info('F21 reference scene compiled',timeMs,'ms',
      'vertices',metrics.vertexCount,'bufferBytes',metrics.approximateBufferBytes);
    await app.close();
  },45000);
});
