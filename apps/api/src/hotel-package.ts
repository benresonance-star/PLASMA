import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import { hashSourceBytes } from '@spds/import-core';
import {
  RIVERSIDE_HOTEL_ID,HOTEL_MODULE_IDS,hotelModuleId,resolveHotel,
  type HotelManifest,type HotelSourceModule,
} from './hotel-project.js';

export interface HotelPackage {
  readonly contract:'plasma.hotel-portable-package/0.1';
  readonly modelKind:'linked-Loft-subprojects';
  readonly hotelId:string;
  readonly manifest:HotelManifest;
  readonly modules:readonly {id:string;source:HotelSourceModule}[];
  readonly contentHash:string;
  readonly exchangeStatus:'plasma-json-only-not-ifc';
}
function content(data:Omit<HotelPackage,'contentHash'>){
  return hashSourceBytes(JSON.stringify({
    hotelId:data.hotelId,manifest:data.manifest,modules:data.modules,
  }));
}
export async function exportHotelPackage(store:VersionStore,branchId:string):Promise<HotelPackage>{
  const hotel=await resolveHotel(store,branchId);
  const source={
    contract:'plasma.hotel-portable-package/0.1' as const,
    modelKind:'linked-Loft-subprojects' as const,
    hotelId:hotel.hotelId,manifest:hotel.manifest,
    modules:[...hotel.modules].sort(([a],[b])=>a.localeCompare(b)).map(([id,module])=>({
      id,source:module,
    })),
    exchangeStatus:'plasma-json-only-not-ifc' as const,
  };
  return {...source,contentHash:content(source)};
}
export function validateHotelPackage(pkg:HotelPackage):void{
  if(!pkg||pkg.contract!=='plasma.hotel-portable-package/0.1'||
    pkg.modelKind!=='linked-Loft-subprojects'||
    pkg.exchangeStatus!=='plasma-json-only-not-ifc'||
    pkg.hotelId!==RIVERSIDE_HOTEL_ID||
    pkg.contentHash!==content(pkg)||
    pkg.manifest.contract!=='plasma.hotel-linked-project/0.1'||
    pkg.manifest.keys!==168||pkg.manifest.rooms.length!==168||
    pkg.modules.length!==5||pkg.manifest.subprojectIds.length!==5)
    throw new Error('HOTEL_PACKAGE_INVALID_CONTRACT_OR_DIGEST');
  const ids=new Set(pkg.manifest.rooms.map(r=>r.id));
  if(ids.size!==168||new Set(pkg.modules.map(m=>m.id)).size!==5)
    throw new Error('HOTEL_PACKAGE_DUPLICATE_ENTITY');
  const map=new Map(pkg.modules.map(m=>[m.id,m.source]));
  if(HOTEL_MODULE_IDS.some(key=>!map.has(hotelModuleId(key))))
    throw new Error('HOTEL_PACKAGE_MISSING_MODULE');
  for(const {id,source} of pkg.modules){
    if(source.contract!=='plasma.loft-linked-subproject/0.1'||
      source.moduleKey===undefined||id!==hotelModuleId(source.moduleKey)||
      source.loftProject.schemaVersion!==2||source.loftProject.units!=='mm'||
      source.sourceHash!==hashSourceBytes(JSON.stringify(source.loftProject))||
      source.loftProject.parts.length<1||source.loftProject.parts.length>64||
      source.loftProject.assemblies.length!==1)
      throw new Error('HOTEL_PACKAGE_SOURCE_INVALID: '+id);
    if(source.loftProject.parts.some(p=>p.features.length!==2||
      ![p.parameters.W,p.parameters.H,p.parameters.D].every(x=>Number.isFinite(x)&&x>0)))
      throw new Error('HOTEL_PACKAGE_UNSUPPORTED_GEOMETRY_SOURCE: '+id);
  }
  const reference=map.get(hotelModuleId('window-a4'))!.windowWidthMm;
  if(pkg.modules.some(m=>m.source.moduleKey!=='building-shell'&&
    m.source.windowWidthMm!==reference))
    throw new Error('HOTEL_PACKAGE_UNSYNCHRONISED_DRIVERS');
  for(const room of pkg.manifest.rooms){
    if(!room.id.startsWith(RIVERSIDE_HOTEL_ID+':L')||
      room.level<1||room.level>7||room.bay<0||room.bay>=12||
      !map.has(room.moduleId)||room.windowModuleId!==hotelModuleId('window-a4')||
      ![room.xMm,room.yMm,room.zMm].every(Number.isFinite))
      throw new Error('HOTEL_PACKAGE_INVALID_OCCURRENCE: '+room.id);
  }
}
export async function importHotelPackage(
  store:VersionStore,body:{
    readonly modelId:string;readonly branchId:string;readonly expectedHeadHash:string;
    readonly package:HotelPackage;
  },
){
  validateHotelPackage(body.package);
  const head=await asPromise(store.getBranchHead(body.branchId));
  if(head.modelId!==body.modelId||head.headHash!==body.expectedHeadHash)
    throw new Error('HOTEL_PACKAGE_HEAD_CONFLICT');
  const now=new Date().toISOString();
  const objects=[
    {
      id:body.package.hotelId,kind:'Model',
      semanticType:'plasma.hotel.project',name:body.package.manifest.name,
      schemaVersion:'1.0.0',createdAt:now,updatedAt:now,
      metadata:body.package.manifest,
    },
    ...body.package.modules.map(item=>({
      id:item.id,kind:'Model',
      semanticType:'plasma.loft.subproject',name:item.source.displayName,
      schemaVersion:'1.0.0',createdAt:now,updatedAt:now,
      metadata:item.source,
    })),
  ];
  const event=await asPromise(store.applyMutation({
    branchId:body.branchId,actor:{type:'user',id:'northstar-hotel-import'},
    command:'HOTEL_IMPORT_LINKED_PACKAGE',
    expectedHeadHash:body.expectedHeadHash,targetIds:objects.map(o=>o.id),
    reason:'Import a validated, digest-pinned hotel with 168 stable room links and five Loft definitions',
    mutate:items=>{
      if(objects.some(o=>items.has(o.id)))throw new Error('HOTEL_PACKAGE_ALREADY_EXISTS');
      for(const o of objects)items.set(o.id,o as Record<string,unknown>);
      return objects.map(o=>o.id);
    },
  }));
  return {
    status:'hotel-package-imported',hotelId:body.package.hotelId,
    roomCount:168,moduleCount:5,
    headHash:event.afterHash,eventId:event.eventId,
    contentHash:body.package.contentHash,
    ifcVerified:false,
  };
}
export function registerHotelPackageRoutes(app:FastifyInstance,store:VersionStore):void{
  app.get<{Params:{modelId:string};Querystring:{branchId:string}}>(
    '/models/:modelId/hotels/riverside/export-package',async(req,reply)=>{
      try{
        const head=await asPromise(store.getBranchHead(req.query.branchId));
        if(head.modelId!==req.params.modelId)
          return reply.code(409).send({failureCode:'HOTEL_PACKAGE_BRANCH_MISMATCH'});
        const pkg=await exportHotelPackage(store,req.query.branchId);
        return reply.header('content-disposition',
          'attachment; filename="Riverside-Hotel-Loft-Subprojects.plasma.json"').send(pkg);
      }catch(e){
        return reply.code(422).send({
          failureCode:'HOTEL_PACKAGE_EXPORT_REJECTED',
          summary:e instanceof Error?e.message:'Export rejected',
        });
      }
    },
  );
  app.post<{Params:{modelId:string};Body:{
    readonly branchId:string;readonly expectedHeadHash:string;
    readonly package:HotelPackage;
  }}>('/models/:modelId/hotels/import-package',async(req,reply)=>{
    try{
      const size=Buffer.byteLength(JSON.stringify(req.body.package),'utf8');
      if(size>3_000_000)throw new Error('HOTEL_PACKAGE_SIZE_LIMIT');
      const accepted=await importHotelPackage(store,{
        modelId:req.params.modelId,branchId:req.body.branchId,
        expectedHeadHash:req.body.expectedHeadHash,package:req.body.package,
      });
      return reply.code(201).send(accepted);
    }catch(e){
      const message=e instanceof Error?e.message:'Import rejected';
      return reply.code(/CONFLICT|ALREADY_EXISTS/.test(message)?409:422).send({
        failureCode:'HOTEL_PACKAGE_IMPORT_REJECTED',summary:message,
      });
    }
  });
}
