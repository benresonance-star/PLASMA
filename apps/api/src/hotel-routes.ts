import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import {
  bootstrapHotel, hotelError, resolveHotel, reviseHotelWindows,
  RIVERSIDE_HOTEL_ID,
} from './hotel-project.js';
import { buildHotelScene } from './hotel-scene.js';

interface HotelBase {
  readonly branchId:string;
  readonly expectedHeadHash:string;
}
type RouteParams={readonly modelId:string};
async function assertHead(store:VersionStore,modelId:string,body:HotelBase){
  if(!modelId||!body?.branchId||!body.expectedHeadHash)
    throw new Error('HOTEL_BASE_REVISION_REQUIRED');
  const branch=await asPromise(store.getBranchHead(body.branchId));
  if(branch.modelId!==modelId||branch.headHash!==body.expectedHeadHash)
    throw new Error('HOTEL_HEAD_CONFLICT');
}
function rejection(reply:{code:(status:number)=>{send:(value:unknown)=>unknown}},err:unknown){
  const data=hotelError(err);
  const status=data.status===422&&/NATIVE_SERVICE_REQUIRED|SERVICE_UNAVAILABLE/.test(data.summary)
    ?503:data.status;
  return reply.code(status).send({...data,publicationReady:false});
}
export function registerHotelRoutes(app:FastifyInstance,store:VersionStore):void{
  app.post<{Params:RouteParams;Body:HotelBase}>(
    '/models/:modelId/hotels/bootstrap',async(req,reply)=>{
      try{
        await assertHead(store,req.params.modelId,req.body);
        const result=await bootstrapHotel(store,{
          modelId:req.params.modelId,...req.body,
        });
        return reply.code(201).send(result);
      }catch(err){return rejection(reply,err);}
    },
  );
  app.get<{Params:RouteParams;Querystring:{branchId:string}}>(
    '/models/:modelId/hotels/riverside',async(req,reply)=>{
      try{
        const branch=await asPromise(store.getBranchHead(req.query.branchId));
        if(branch.modelId!==req.params.modelId)throw new Error('HOTEL_HEAD_CONFLICT');
        const hotel=await resolveHotel(store,req.query.branchId,RIVERSIDE_HOTEL_ID);
        return reply.send({
          status:'linked-hotel-ready',hotelId:RIVERSIDE_HOTEL_ID,
          headHash:branch.headHash,manifest:hotel.manifest,
          modules:[...hotel.modules].map(([id,module])=>({
            id,name:module.displayName,sourceProjectId:module.sourceProjectId,
            sourceHash:module.sourceHash,revision:module.revision,
            partCount:module.loftProject.parts.length,
            windowWidthMm:module.windowWidthMm,sourceFormat:'loftproj-v2',
          })),
          nativeVerified:false,
          publicationReady:false,
        });
      }catch(err){return rejection(reply,err);}
    },
  );
  app.post<{
    Params:RouteParams;
    Body:HotelBase & {kernel?:'occt-native'|'exact-adapter';
      selectedLevel?:number;mode?:'exterior'|'floor'};
  }>('/models/:modelId/hotels/riverside/scene',async(req,reply)=>{
    try{
      await assertHead(store,req.params.modelId,req.body);
      const kernel=req.body.kernel??'exact-adapter';
      if(kernel!=='occt-native'&&kernel!=='exact-adapter')
        throw new Error('HOTEL_KERNEL_UNSUPPORTED');
      const url=process.env['GEOMETRY_URL']??process.env['SPDS_GEOMETRY_URL']??'';
      if(kernel==='occt-native'&&!url)
        return reply.code(503).send({
          failureCode:'HOTEL_NATIVE_SERVICE_REQUIRED',
          summary:'Native OpenCascade service is not configured. No native claim can be made.',
          nativeVerified:false,
        });
      const hotel=await resolveHotel(store,req.body.branchId,RIVERSIDE_HOTEL_ID);
      const result=await buildHotelScene({
        hotel,headHash:req.body.expectedHeadHash,kernel,serviceUrl:url,
        selectedLevel:req.body.selectedLevel??3,
        mode:req.body.mode??'exterior',
      });
      await assertHead(store,req.params.modelId,req.body);
      return reply.send(result);
    }catch(err){return rejection(reply,err);}
  });
  app.post<{Params:RouteParams;Body:HotelBase & {nextWidthMm:number}}>(
    '/models/:modelId/hotels/riverside/revise-window',async(req,reply)=>{
      try{
        await assertHead(store,req.params.modelId,req.body);
        const result=await reviseHotelWindows(store,{
          ...req.body,modelId:req.params.modelId,hotelId:RIVERSIDE_HOTEL_ID,
        });
        return reply.send(result);
      }catch(err){return rejection(reply,err);}
    },
  );
}
