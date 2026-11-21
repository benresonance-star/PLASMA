import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import { hashSourceBytes } from '@spds/import-core';

export type SiteXYZ = readonly [number,number,number];
export interface SiteControl {
  readonly id:string;
  /** A source camera, photogrammetry or splat coordinate in millimetres. */
  readonly observedMm:SiteXYZ;
  /** Matching Plasma design coordinates in millimetres, not certified survey. */
  readonly designMm:SiteXYZ;
}
export interface SiteObservation {
  readonly captureId:string;
  readonly name:string;
  readonly mediaKind:'photo'|'video'|'point-cloud'|'gaussian-splat'|'drone';
  readonly capturedAt:string;
  readonly mediaRef:string;
  readonly controls:readonly SiteControl[];
  readonly provenance:'user-supplied';
}
export interface FitResult {
  readonly kind:'local-yaw-rigid-fit';
  readonly yawDeg:number;
  readonly translationMm:SiteXYZ;
  readonly scale:1;
  readonly rmsResidualMm:number;
  readonly maxResidualMm:number;
  readonly controlCount:number;
  readonly residuals:readonly {id:string;errorMm:number}[];
  readonly spatialStatus:'local-fit-unverified';
  readonly surveyCertified:false;
  readonly evidenceNote:string;
}
export interface StoredSiteCapture {
  readonly contract:'plasma.hotel-site-observation/0.1';
  readonly hotelId:string;
  readonly observation:SiteObservation;
  readonly fit:FitResult;
  readonly createdAt:string;
  readonly sourceHash:string;
}
const finite3=(p:SiteXYZ):boolean=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
function center(points:readonly SiteXYZ[]):[number,number,number]{
  const sum=points.reduce<[number,number,number]>((acc,p)=>[
    acc[0]+p[0],acc[1]+p[1],acc[2]+p[2],
  ],[0,0,0]);return sum.map(v=>v/points.length) as [number,number,number];
}
/** Explicitly planar, rigid XY/yaw + vertical translation registration.
 * It cannot silently infer scale, tilt, GPS or survey certification.
 * Residual error and out-of-plane discrepancies remain visible.
 */
export function fitHotelLocalCapture(controls:readonly SiteControl[]):FitResult{
  if(!Array.isArray(controls)||controls.length<4||controls.length>50)
    throw new Error('SITE_FIT_REQUIRES_4_TO_50_CONTROL_PAIRS');
  if(new Set(controls.map(c=>c.id)).size!==controls.length ||
     controls.some(c=>!c.id||!finite3(c.observedMm)||!finite3(c.designMm)))
    throw new Error('SITE_FIT_INVALID_OR_DUPLICATE_CONTROL');
  const obs=center(controls.map(c=>c.observedMm));
  const dst=center(controls.map(c=>c.designMm));
  let dot=0,cross=0,spread=0;
  for(const p of controls){
    const a=p.observedMm,b=p.designMm;
    const ax=a[0]-obs[0],ay=a[1]-obs[1];
    const bx=b[0]-dst[0],by=b[1]-dst[1];
    spread+=ax*ax+ay*ay;dot+=ax*bx+ay*by;cross+=ax*by-ay*bx;
  }
  if(spread<100*100||Math.hypot(dot,cross)<1e-6)
    throw new Error('SITE_FIT_DEGENERATE_CONTROL_GEOMETRY');
  const theta=Math.atan2(cross,dot),co=Math.cos(theta),si=Math.sin(theta);
  const dx=dst[0]-(co*obs[0]-si*obs[1]);
  const dy=dst[1]-(si*obs[0]+co*obs[1]);
  const dz=dst[2]-obs[2];
  const residuals=controls.map(p=>{
    const a=p.observedMm,b=p.designMm;
    const x=co*a[0]-si*a[1]+dx;
    const y=si*a[0]+co*a[1]+dy;
    const z=a[2]+dz;
    return {id:p.id,errorMm:Math.hypot(b[0]-x,b[1]-y,b[2]-z)};
  });
  const rms=Math.sqrt(residuals.reduce((total,p)=>total+p.errorMm**2,0)/controls.length);
  return {
    kind:'local-yaw-rigid-fit',yawDeg:theta*180/Math.PI,
    translationMm:[dx,dy,dz],scale:1,rmsResidualMm:rms,
    maxResidualMm:Math.max(...residuals.map(p=>p.errorMm)),
    controlCount:controls.length,residuals,
    spatialStatus:'local-fit-unverified',surveyCertified:false,
    evidenceNote:'Least-squares XY yaw and XYZ translation only. No survey datum, tilt, scale, georeferencing or registration certification.',
  };
}
function validateCapture(observation:SiteObservation):void{
  if(!observation||typeof observation.captureId!=='string'||
    !/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(observation.captureId)||
    !observation.name||observation.name.length>120||
    !['photo','video','point-cloud','gaussian-splat','drone'].includes(observation.mediaKind)||
    Number.isNaN(Date.parse(observation.capturedAt))||
    typeof observation.mediaRef!=='string'||observation.mediaRef.length>300||
    observation.provenance!=='user-supplied')
    throw new Error('SITE_CAPTURE_INVALID_METADATA');
  if(!/^sha256:|^local:|^library:/.test(observation.mediaRef))
    throw new Error('SITE_CAPTURE_MUST_REFERENCE_USER_MEDIA_NOT_ARBITRARY_REMOTE_URL');
}
export function registerHotelSiteRoutes(app:FastifyInstance,store:VersionStore):void{
  app.post<{Params:{modelId:string};Body:{
    readonly branchId:string;readonly expectedHeadHash:string;
    readonly hotelId:string;readonly observation:SiteObservation;
  }}>('/models/:modelId/hotels/riverside/site-observations',async(req,reply)=>{
    try{
      const body=req.body;
      const head=await asPromise(store.getBranchHead(body.branchId));
      if(head.modelId!==req.params.modelId||head.headHash!==body.expectedHeadHash)
        return reply.code(409).send({failureCode:'SITE_HEAD_CONFLICT'});
      const parent=await asPromise(store.getObject(body.branchId,body.hotelId));
      if(parent?.['semanticType']!=='plasma.hotel.project')
        throw new Error('SITE_HOTEL_PARENT_MISSING');
      validateCapture(body.observation);
      const fit=fitHotelLocalCapture(body.observation.controls);
      const id='entity:hotel:site-observation:'+body.observation.captureId;
      if(await asPromise(store.getObject(body.branchId,id)))
        return reply.code(409).send({failureCode:'SITE_CAPTURE_ALREADY_EXISTS'});
      const metadata:StoredSiteCapture={
        contract:'plasma.hotel-site-observation/0.1',hotelId:body.hotelId,
        observation:body.observation,fit,createdAt:new Date().toISOString(),
        sourceHash:hashSourceBytes(JSON.stringify(body.observation)),
      };
      const event=await asPromise(store.upsertObject(
        body.branchId,{type:'user',id:'northstar-site'},
        body.expectedHeadHash,{
          id,name:body.observation.name,kind:'Model',
          schemaVersion:'1.0.0',semanticType:'plasma.hotel.site-observation',
          createdAt:metadata.createdAt,updatedAt:metadata.createdAt,metadata,
        },
      ));
      return reply.code(201).send({
        status:'site-observation-recorded',siteId:id,fit,
        headHash:event.afterHash,eventId:event.eventId,
        surveyCertified:false,gaussianRendered:false,publicationReady:false,
      });
    }catch(e){
      return reply.code(422).send({
        failureCode:'SITE_OBSERVATION_REJECTED',
        summary:e instanceof Error?e.message:'Site observation rejected',
      });
    }
  });
  app.get<{Params:{modelId:string};Querystring:{branchId:string}}>(
    '/models/:modelId/hotels/riverside/site-observations',async(req,reply)=>{
      const head=await asPromise(store.getBranchHead(req.query.branchId));
      if(head.modelId!==req.params.modelId)
        return reply.code(409).send({failureCode:'SITE_BRANCH_MISMATCH'});
      const objects=await asPromise(store.listObjects(req.query.branchId));
      const observations=objects.filter(o=>o['semanticType']==='plasma.hotel.site-observation')
        .map(o=>({id:o['id'],metadata:o['metadata']}));
      return reply.send({headHash:head.headHash,observations});
    },
  );
}
