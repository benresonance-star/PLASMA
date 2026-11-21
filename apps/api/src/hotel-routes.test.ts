import { describe,expect,it } from 'vitest';
import { buildServer } from './server.js';
import {
  RIVERSIDE_HOTEL_ID,HOTEL_MODULE_IDS,hotelModuleId,
  makeHotelManifest,makeHotelModule,makeHotelLoftSource,
} from './hotel-project.js';
import { clearHotelCompilerCache } from './hotel-scene.js';

async function model(){
  const {app,store}=buildServer();
  const created=await app.inject({method:'POST',url:'/models',
    payload:{name:'Riverside Hotel / Northstar integrated design fixture'}});
  expect(created.statusCode,created.body).toBe(201);
  const result=created.json() as {model:{modelId:string};branchId:string;headHash:string};
  return {app,store,modelId:result.model.modelId,branchId:result.branchId,headHash:result.headHash};
}
describe('F13 modular hotel source contract',()=>{
  it('specifies 8 storeys, seven hotel guest floors, 168 unique linked suites',()=>{
    const hotel=makeHotelManifest();
    expect(hotel.keys).toBe(168);
    expect(hotel.rooms).toHaveLength(168);
    expect(hotel.subprojectIds).toHaveLength(5);
    expect(new Set(hotel.rooms.map(room=>room.id)).size).toBe(168);
    for(let level=1;level<=7;level++){
      const rooms=hotel.rooms.filter(room=>room.level===level);
      expect(rooms).toHaveLength(24);
      expect(rooms.filter(room=>room.moduleId===hotelModuleId('suite-accessible')))
        .toHaveLength(2);
      expect(rooms.filter(room=>room.moduleId===hotelModuleId('suite-corner')))
        .toHaveLength(4);
      expect(rooms.every(room=>room.windowModuleId===hotelModuleId('window-a4')))
        .toBe(true);
    }
  });
  it('keeps linked Loft projects parametric, source hashed, separated and compatible with a changing hosted window',()=>{
    const modules=HOTEL_MODULE_IDS.map(key=>makeHotelModule(key));
    expect(new Set(modules.map(module=>module.sourceProjectId)).size).toBe(5);
    for(const module of modules){
      expect(module.loftProject.schemaVersion).toBe(2);
      expect(module.loftProject.units).toBe('mm');
      expect(module.loftProject.parts.every(part=>part.features.length===2)).toBe(true);
      expect(module.loftProject.assemblies[0]?.instances.length).toBe(module.loftProject.parts.length);
      expect(module.sourceHash).toBe(makeHotelModule(module.moduleKey).sourceHash);
    }
    const oldWindow=makeHotelLoftSource('window-a4',1800);
    const newWindow=makeHotelLoftSource('window-a4',2200);
    expect(oldWindow.parts[0]!.parameters.W).toBe(1620);
    expect(newWindow.parts[0]!.parameters.W).toBe(2020);
    expect(makeHotelModule('suite-standard',1,2200).sourceHash)
      .not.toBe(makeHotelModule('suite-standard').sourceHash);
  });
});

describe('F13 hotel linked subprojects and atomic design revision',()=>{
  it('stores 5 separate Loft source models and 1 parent in a single optimistic-concurrency event',async()=>{
    const s=await model();
    const bootstrap=await s.app.inject({
      method:'POST',url:'/models/'+s.modelId+'/hotels/bootstrap',
      payload:{branchId:s.branchId,expectedHeadHash:s.headHash},
    });
    expect(bootstrap.statusCode,bootstrap.body).toBe(201);
    expect(bootstrap.json()).toMatchObject({
      status:'linked-hotel-created',keys:168,moduleCount:5,instanceLinks:337,
      publicationReady:false,
    });
    const objects=await s.store.listObjects(s.branchId);
    expect(objects.filter(object=>object['semanticType']==='plasma.loft.subproject'))
      .toHaveLength(5);
    const parent=objects.find(object=>object['id']===RIVERSIDE_HOTEL_ID);
    expect(parent?.['semanticType']).toBe('plasma.hotel.project');
    const events=await s.store.listEvents(s.branchId);
    expect(events.filter(event=>event.command==='HOTEL_BOOTSTRAP_LINKED_SUBPROJECTS'))
      .toHaveLength(1);
    const second=await s.app.inject({method:'POST',
      url:'/models/'+s.modelId+'/hotels/bootstrap',
      payload:{branchId:s.branchId,expectedHeadHash:bootstrap.json().headHash}});
    expect(second.statusCode).toBe(409);
    await s.app.close();
  });
  it('compiles a 168-room 3D source scene, updates all 168 linked windows atomically, redraws and rejects stale acceptance',async()=>{
    clearHotelCompilerCache();
    const s=await model();
    const endpoint='/models/'+s.modelId+'/hotels/riverside';
    const bootstrap=await s.app.inject({method:'POST',url:'/models/'+s.modelId+'/hotels/bootstrap',
      payload:{branchId:s.branchId,expectedHeadHash:s.headHash}});
    const originalHead=bootstrap.json().headHash as string;
    const original=await s.app.inject({method:'POST',url:endpoint+'/scene',payload:{
      branchId:s.branchId,expectedHeadHash:originalHead,kernel:'exact-adapter',
      mode:'exterior',selectedLevel:3,
    }});
    expect(original.statusCode,original.body.slice(0,2000)).toBe(200);
    expect(original.json()).toMatchObject({
      kernel:'exact-adapter',nativeVerified:false,
      roomCount:168,windowWidthMm:1800,
      drawings:{issueStatus:'schematic-not-for-construction'},
    });
    const scene=original.json();
    expect(scene.sceneObjectCount).toBeGreaterThan(500);
    expect(scene.compiledUniqueSolidCount).toBeGreaterThan(40);
    expect(scene.meshes.some((m:{semanticOwner:string})=>
      m.semanticOwner.includes(':L03N12'))).toBe(true);
    expect(scene.modules).toHaveLength(5);
    expect((await s.store.getBranchHead(s.branchId)).headHash).toBe(originalHead);
    const edit=await s.app.inject({method:'POST',url:endpoint+'/revise-window',
      payload:{branchId:s.branchId,expectedHeadHash:originalHead,nextWidthMm:2100}});
    expect(edit.statusCode,edit.body).toBe(200);
    expect(edit.json()).toMatchObject({
      status:'linked-source-revision-accepted',oldWidthMm:1800,
      newWidthMm:2100,affectedRoomCount:168,affectedWindowCount:168,
    });
    expect(edit.json().revisedModuleIds).toHaveLength(4);
    const nextHead=edit.json().headHash as string;
    expect(nextHead).not.toBe(originalHead);
    const after=await s.app.inject({method:'POST',url:endpoint+'/scene',payload:{
      branchId:s.branchId,expectedHeadHash:nextHead,kernel:'exact-adapter',
      mode:'exterior',selectedLevel:3,
    }});
    expect(after.statusCode,after.body.slice(0,1500)).toBe(200);
    expect(after.json().windowWidthMm).toBe(2100);
    expect(after.json().roomCount).toBe(168);
    expect(after.json().sceneObjectCount).toBe(scene.sceneObjectCount);
    expect(after.json().drawings.planHash).not.toBe(scene.drawings.planHash);
    expect(after.json().drawings.sectionHash).not.toBe(scene.drawings.sectionHash);
    const previousKeys=scene.manifest.rooms.map((r:{id:string})=>r.id);
    expect(after.json().manifest.rooms.map((r:{id:string})=>r.id)).toEqual(previousKeys);
    const reviews=after.json().modules;
    expect(reviews.filter((r:{revision:number})=>r.revision===1)).toHaveLength(4);
    expect(reviews.filter((r:{revision:number})=>r.revision===0)).toHaveLength(1);
    const replay=await s.app.inject({method:'POST',url:endpoint+'/revise-window',
      payload:{branchId:s.branchId,expectedHeadHash:originalHead,nextWidthMm:2300}});
    expect(replay.statusCode).toBe(409);
    expect((await s.store.listEvents(s.branchId)).filter(
      event=>event.command==='HOTEL_REVISE_LINKED_WINDOW_SYSTEM')).toHaveLength(1);
    const wrong=await s.app.inject({method:'POST',url:endpoint+'/revise-window',
      payload:{branchId:s.branchId,expectedHeadHash:nextHead,nextWidthMm:4000}});
    expect(wrong.statusCode).toBe(422);
    await s.app.close();
  },30000);
});
describe('F13 actual OpenCascade hotel project',()=>{
  it.skipIf(!process.env['GEOMETRY_URL'])(
    'constructs Loft B-reps from 5 linked projects, expands them to 168 suites and preserves provenance',async()=>{
      clearHotelCompilerCache();
      const s=await model();
      const bootstrap=await s.app.inject({method:'POST',url:'/models/'+s.modelId+'/hotels/bootstrap',
        payload:{branchId:s.branchId,expectedHeadHash:s.headHash}});
      const scene=await s.app.inject({method:'POST',url:'/models/'+s.modelId+'/hotels/riverside/scene',
        payload:{branchId:s.branchId,expectedHeadHash:bootstrap.json().headHash,
          kernel:'occt-native',mode:'exterior',selectedLevel:3}});
      expect(scene.statusCode,scene.body.slice(0,1000)).toBe(200);
      expect(scene.json()).toMatchObject({
        status:'linked-hotel-scene',kernel:'occt-native',nativeVerified:true,
        roomCount:168,
      });
      expect(scene.json().modules.every((x:{nativeVerified:boolean})=>x.nativeVerified))
        .toBe(true);
      expect(scene.json().sceneObjectCount).toBeGreaterThan(500);
      expect(scene.json().meshes.every((x:{vertices:unknown[];indices:unknown[]})=>
        x.vertices.length>0&&x.indices.length>0)).toBe(true);
      await s.app.close();
    },150000);
});
