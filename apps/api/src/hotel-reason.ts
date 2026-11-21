import type { FastifyInstance } from 'fastify';
import { asPromise, type VersionStore } from '@spds/version-core';
import { hashSourceBytes } from '@spds/import-core';
import {
  RIVERSIDE_HOTEL_ID,hotelModuleId,resolveHotel,reviseHotelWindows,
  type ResolvedHotel,
} from './hotel-project.js';

export interface ReasonClaim {
  readonly id:string;readonly label:string;readonly before:number;readonly after:number;
  readonly delta:number;readonly unit:string;
  readonly basis:'computed-from-Loft-source'|'bounded-design-constraint';
  readonly evidence:readonly string[];
}
export interface CausalNode {
  readonly id:string;readonly label:string;
  readonly kind:'driver'|'definition'|'instances'|'representation'|'gate';
  readonly state:'source-backed'|'unverified';
}
export interface HotelWindowProposal {
  readonly status:'governed-window-proposal';
  readonly candidateHash:string;readonly headHash:string;
  readonly windowWidthBeforeMm:number;readonly windowWidthAfterMm:number;
  readonly affectedRoomCount:168;
  readonly linkedModuleIds:readonly string[];
  readonly claims:readonly ReasonClaim[];
  readonly causal:{
    readonly nodes:readonly CausalNode[];
    readonly edges:readonly {from:string;to:string;relation:string}[];
  };
  readonly unresolved:readonly string[];
  readonly commitStatus:'uncommitted';
  readonly engineeringApproved:false;
}
export function makeHotelWindowProposal(hotel:ResolvedHotel,
  headHash:string,target:number):HotelWindowProposal{
  if(!headHash||!Number.isFinite(target)||target<1200||target>2500)
    throw new Error('HOTEL_PROPOSAL_OUTSIDE_WINDOW_DOMAIN');
  const source=hotel.modules.get(hotelModuleId('window-a4'));
  if(!source)throw new Error('HOTEL_PROPOSAL_WINDOW_SOURCE_MISSING');
  const initial=source.windowWidthMm;
  if(target===initial)throw new Error('HOTEL_PROPOSAL_NO_CHANGE');
  const glass=source.loftProject.parts.find(p=>p.id==='Glass');
  if(!glass||glass.parameters.D<=0||glass.parameters.H<=0)
    throw new Error('HOTEL_PROPOSAL_GLAZING_SOURCE_INVALID');
  const frameDeduction=initial-glass.parameters.W;
  if(frameDeduction<1||frameDeduction>500)
    throw new Error('HOTEL_PROPOSAL_FRAME_GAP_UNSUPPORTED');
  if(hotel.manifest.rooms.length!==168)
    throw new Error('HOTEL_PROPOSAL_ROOM_COUNT_MISMATCH');
  const height=glass.parameters.D;
  const glazingBefore=(initial-frameDeduction)*height*168/1e6;
  const glazingAfter=(target-frameDeduction)*height*168/1e6;
  const nominalBefore=initial*height*168/1e6;
  const nominalAfter=target*height*168/1e6;
  const jambBefore=(hotel.manifest.roomWidthMm-initial)/2;
  const jambAfter=(hotel.manifest.roomWidthMm-target)/2;
  if(jambAfter<200)throw new Error('HOTEL_PROPOSAL_INSUFFICIENT_JAMB');
  const projectId=hotel.hotelId;
  const windowId=hotelModuleId('window-a4');
  const impacted=['suite-standard','suite-accessible','suite-corner']
    .map(hotelModuleId);
  const sourceIds=[windowId,...impacted];
  const claims:ReasonClaim[]=[
    {
      id:'claim:hotel:a4:glazing-area',label:'Insulated glazing source area',
      before:glazingBefore,after:glazingAfter,
      delta:glazingAfter-glazingBefore,unit:'m²',
      basis:'computed-from-Loft-source',
      evidence:[windowId,glass.id],
    },
    {
      id:'claim:hotel:a4:opening-area',label:'Nominal window opening area',
      before:nominalBefore,after:nominalAfter,
      delta:nominalAfter-nominalBefore,unit:'m²',
      basis:'computed-from-Loft-source',
      evidence:[windowId,...impacted],
    },
    {
      id:'claim:hotel:a4:minimum-jamb',label:'Nominal remaining jamb each side',
      before:jambBefore,after:jambAfter,delta:jambAfter-jambBefore,unit:'mm',
      basis:'bounded-design-constraint',
      evidence:[...impacted],
    },
  ];
  const nodes:CausalNode[]=[
    {id:windowId,label:'A4 / window definition',kind:'driver',state:'source-backed'},
    ...impacted.map(id=>({
      id,label:id.split(':').pop()??id,kind:'definition' as const,state:'source-backed' as const,
    })),
    {id:projectId+':rooms',label:'168 room occurrences',kind:'instances',state:'source-backed'},
    {id:'sheet:hotel:A-201',label:'Façade A-201',kind:'representation',state:'source-backed'},
    {id:'sheet:hotel:A-514',label:'Junction A-514',kind:'representation',state:'source-backed'},
    {id:'sheet:hotel:A-601',label:'Schedule A-601',kind:'representation',state:'source-backed'},
    {id:'gate:hotel:fire-weather-thermal',label:'Fire / weather / thermal',kind:'gate',state:'unverified'},
  ];
  const edges=[
    ...impacted.map(id=>({from:windowId,to:id,relation:'drives opening geometry'})),
    ...impacted.map(id=>({from:id,to:projectId+':rooms',relation:'instances linked definition'})),
    ...['sheet:hotel:A-201','sheet:hotel:A-514','sheet:hotel:A-601']
      .map(id=>({from:projectId+':rooms',to:id,relation:'derives representation'})),
    {from:windowId,to:'gate:hotel:fire-weather-thermal',
      relation:'requires independent verification'},
  ];
  const candidateHash=hashSourceBytes(JSON.stringify({
    hotelId:projectId,headHash,target,
    sourceHashes:sourceIds.map(id=>hotel.modules.get(id)?.sourceHash),
    roomIds:hotel.manifest.rooms.map(r=>r.id),
    calculationVersion:'plasma-reason-a4/0.1',
  }));
  return {
    status:'governed-window-proposal',candidateHash,headHash,
    windowWidthBeforeMm:initial,windowWidthAfterMm:target,
    affectedRoomCount:168,linkedModuleIds:sourceIds,
    claims,causal:{nodes,edges},
    unresolved:[
      'No daylight or energy simulation has run: glazing area is not a daylight or thermal performance prediction',
      'No structural, fire, egress, façade water penetration or acoustic validation has run',
      'Cost and carbon are intentionally omitted without project-specific quantities, EPDs and rates',
      'The source-linked drawing set remains a design study and cannot be issued for construction',
    ],
    commitStatus:'uncommitted',engineeringApproved:false,
  };
}
interface HeadBody{
  readonly branchId:string;readonly expectedHeadHash:string;
  readonly nextWidthMm:number;
}
async function fetchCurrentHotel(store:VersionStore,modelId:string,body:HeadBody){
  const head=await asPromise(store.getBranchHead(body.branchId));
  if(head.modelId!==modelId||head.headHash!==body.expectedHeadHash)
    throw new Error('HOTEL_HEAD_CONFLICT');
  return await resolveHotel(store,body.branchId,RIVERSIDE_HOTEL_ID);
}
export function registerHotelReasonRoutes(app:FastifyInstance,store:VersionStore):void{
  app.post<{Params:{modelId:string};Body:HeadBody}>(
    '/models/:modelId/hotels/riverside/window-proposal',async(req,reply)=>{
      try{
        const hotel=await fetchCurrentHotel(store,req.params.modelId,req.body);
        return reply.send(makeHotelWindowProposal(hotel,req.body.expectedHeadHash,
          req.body.nextWidthMm));
      }catch(e){
        const message=e instanceof Error?e.message:'Proposal failed';
        return reply.code(message.includes('HEAD_CONFLICT')?409:422)
          .send({failureCode:'HOTEL_PROPOSAL_REJECTED',summary:message});
      }
    },
  );
  app.post<{Params:{modelId:string};Body:HeadBody & {candidateHash:string}}>(
    '/models/:modelId/hotels/riverside/accept-reviewed-window',async(req,reply)=>{
      try{
        const hotel=await fetchCurrentHotel(store,req.params.modelId,req.body);
        const candidate=makeHotelWindowProposal(hotel,req.body.expectedHeadHash,
          req.body.nextWidthMm);
        if(!req.body.candidateHash||candidate.candidateHash!==req.body.candidateHash)
          return reply.code(409).send({failureCode:'HOTEL_PROPOSAL_STALE'});
        const result=await reviseHotelWindows(store,{
          modelId:req.params.modelId,branchId:req.body.branchId,
          expectedHeadHash:req.body.expectedHeadHash,hotelId:RIVERSIDE_HOTEL_ID,
          nextWidthMm:req.body.nextWidthMm,
        });
        return reply.send({
          ...result,proposalHash:candidate.candidateHash,
          proposalDisposition:'human-accepted',
          engineeringApproved:false,publicationReady:false,
        });
      }catch(e){
        const message=e instanceof Error?e.message:'Review failed';
        return reply.code(message.includes('HEAD_CONFLICT')?409:422)
          .send({failureCode:'HOTEL_REVIEWED_ACCEPTANCE_REJECTED',summary:message});
      }
    },
  );
}
