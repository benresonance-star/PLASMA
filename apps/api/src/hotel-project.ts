import { hashSourceBytes } from '@spds/import-core';
import { asPromise, type VersionStore } from '@spds/version-core';

export const RIVERSIDE_HOTEL_ID = 'entity:hotel:riverside-168';
export const HOTEL_SUBPROJECT_PREFIX = 'entity:hotel:loft:';
export const HOTEL_MODULE_IDS = ['suite-standard','suite-accessible','suite-corner','window-a4','building-shell'] as const;
export type HotelModuleKey = typeof HOTEL_MODULE_IDS[number];
export type HotelRoomSide = 'north' | 'south';
export interface HotelRoom {
  readonly id: string;
  readonly level: number;
  readonly bay: number;
  readonly side: HotelRoomSide;
  readonly moduleId: string;
  readonly windowModuleId: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
  readonly rotationDeg: 0 | 180;
}
export interface HotelManifest {
  readonly contract: 'plasma.hotel-linked-project/0.1';
  readonly name: 'Riverside Hotel';
  readonly storeys: 8;
  readonly guestLevels: 7;
  readonly keys: 168;
  readonly roomWidthMm: 3900;
  readonly suiteDepthMm: 8100;
  readonly corridorWidthMm: 3000;
  readonly floorToFloorMm: 3400;
  readonly firstGuestFloorZmm: 4200;
  readonly subprojectIds: readonly string[];
  readonly rooms: readonly HotelRoom[];
  readonly captureStatus: 'no-survey-or-georegistration';
  readonly projectStatus: 'design-study-not-issued';
}
export interface LoftPart {
  readonly id:string;
  readonly material:string;
  readonly role:string;
  readonly parameters: {readonly W:number;readonly H:number;readonly D:number};
  readonly features:readonly unknown[];
}
export interface LoftInstance {
  readonly id:string;readonly partId:string;
  readonly placement:{readonly translation:readonly [number,number,number]};
}
export interface HotelLoftProject {
  readonly schemaVersion:2;
  readonly units:'mm';
  readonly id:string;
  readonly parts:readonly LoftPart[];
  readonly rootAssembly:string;
  readonly assemblies:readonly {readonly id:string;readonly instances:readonly LoftInstance[]}[];
}
export interface HotelSourceModule {
  readonly contract:'plasma.loft-linked-subproject/0.1';
  readonly sourceProjectId:string;
  readonly moduleKey:HotelModuleKey;
  readonly displayName:string;
  readonly revision:number;
  readonly sourceHash:string;
  readonly windowWidthMm:number;
  readonly loftProject:HotelLoftProject;
  readonly verification:'source-preserved-native-pending';
}
export interface HotelStoredObject {
  readonly id:string;
  readonly kind:'Model';
  readonly semanticType:string;
  readonly name:string;
  readonly schemaVersion:'1.0.0';
  readonly createdAt:string;
  readonly updatedAt:string;
  readonly metadata:HotelManifest|HotelSourceModule;
}
const R_W=3900, R_D=8100, FIRST=4200, STOREY=3400;
const SOURCE_VERSION=2;
export function hotelModuleId(key:HotelModuleKey):string {return HOTEL_SUBPROJECT_PREFIX+key;}
export function makeHotelManifest():HotelManifest {
  const rooms:HotelRoom[]=[];
  for(let level=1;level<=7;level++)for(const side of ['north','south'] as const)
    for(let bay=0;bay<12;bay++){
      const variant:HotelModuleKey=bay===0||bay===11?'suite-corner':
        bay===5?'suite-accessible':'suite-standard';
      const number=String(bay+1).padStart(2,'0');
      rooms.push({
        id:RIVERSIDE_HOTEL_ID+':L'+String(level).padStart(2,'0')+
          (side==='north'?'N':'S')+number,
        level,bay,side,
        moduleId:hotelModuleId(variant),windowModuleId:hotelModuleId('window-a4'),
        xMm:(bay-5.5)*R_W,yMm:side==='north'?1500:-1500,
        zMm:FIRST+(level-1)*STOREY,
        rotationDeg:side==='north'?0:180,
      });
    }
  if(rooms.length!==168||new Set(rooms.map(r=>r.id)).size!==168)
    throw new Error('HOTEL_MODULE_LAYOUT_INVALID');
  return {
    contract:'plasma.hotel-linked-project/0.1',name:'Riverside Hotel',
    storeys:8,guestLevels:7,keys:168,roomWidthMm:R_W,
    suiteDepthMm:R_D,corridorWidthMm:3000,
    floorToFloorMm:STOREY,firstGuestFloorZmm:FIRST,
    subprojectIds:HOTEL_MODULE_IDS.map(hotelModuleId),
    rooms,captureStatus:'no-survey-or-georegistration',
    projectStatus:'design-study-not-issued',
  };
}
function box(parts:LoftPart[],instances:LoftInstance[],
  id:string,material:string,role:string,w:number,h:number,d:number,
  x:number,y:number,z:number){
  if(![w,h,d].every(v=>Number.isFinite(v)&&v>0))throw new Error('HOTEL_PART_DIMENSION_INVALID');
  const name=id.replace(/[^a-z0-9_-]/gi,'_');
  parts.push({
    id:name,material,role,parameters:{W:w,H:h,D:d},
    features:[
      {id:name+':sketch',type:'sketch',plane:{type:'datum',name:'XY'},
        profile:{kind:'rectangle',width:'W',height:'H'}},
      {id:name+':extrude',type:'extrude',sketch:name+':sketch',depth:'D'},
    ],
  });
  instances.push({id:name+':01',partId:name,placement:{translation:[x,y,z]}});
}
export function makeHotelLoftSource(key:HotelModuleKey,windowWidthMm=1800):HotelLoftProject {
  if(!Number.isFinite(windowWidthMm)||windowWidthMm<1200||windowWidthMm>2500)
    throw new Error('HOTEL_WINDOW_WIDTH_OUT_OF_DOMAIN');
  const parts:LoftPart[]=[],instances:LoftInstance[]=[];
  if(key==='window-a4'){
    const w=windowWidthMm,h=1850,t=90;
    box(parts,instances,'Glass','Insulated glazing','glazing',w-2*t,28,h,0,5,0);
    box(parts,instances,'FrameLeft','Bronze aluminium','frame',t,110,h,-w/2+t/2,0,0);
    box(parts,instances,'FrameRight','Bronze aluminium','frame',t,110,h,w/2-t/2,0,0);
    box(parts,instances,'FrameHead','Bronze aluminium','frame',w,110,t,0,0,h-t);
    box(parts,instances,'FrameSill','Bronze aluminium','frame',w,110,t,0,0,0);
    box(parts,instances,'CentreMullion','Bronze aluminium','frame',60,100,h,0,0,0);
    box(parts,instances,'InnerSashLeft','Anodised bronze','sash',45,40,h-120,-w/2+145,95,65);
    box(parts,instances,'InnerSashRight','Anodised bronze','sash',45,40,h-120,w/2-145,95,65);
    box(parts,instances,'InnerSashRail','Anodised bronze','sash',w-280,40,40,0,95,h/2);
    box(parts,instances,'ThermalBreakHead','Thermal isolation','thermal-break',w-180,35,35,0,75,h-105);
    box(parts,instances,'ThermalBreakSill','Thermal isolation','thermal-break',w-180,35,35,0,75,65);
    box(parts,instances,'SillDrip','Bronze aluminium','flashing',w+120,180,22,0,-70,-38);
  }else if(key==='building-shell'){
    box(parts,instances,'PodiumSlab','Concrete','shell',49400,22400,360,0,0,-360);
    box(parts,instances,'LobbyRoof','Concrete','shell',47200,20000,220,0,0,FIRST-220);
    box(parts,instances,'HotelRoof','Concrete','roof',48400,20800,280,0,0,FIRST+7*STOREY);
    for(let level=1;level<7;level++){
      box(parts,instances,'FloorBand'+level,'Concrete','floor-band',
        47200,20700,200,0,0,FIRST+level*STOREY-200);
    }
    for(let i=0;i<8;i++)for(const side of [-1,1] as const){
      box(parts,instances,'GroundColumn'+side+'_'+i,'Dark stone','column',
        420,480,FIRST-300,-21800+i*6228.57,side*9650,0);
    }
    box(parts,instances,'LobbyGlazingNorth','Glazing','lobby-glazing',46500,130,FIRST-600,0,10350,0);
    box(parts,instances,'LobbyGlazingSouth','Glazing','lobby-glazing',46500,130,FIRST-600,0,-10350,0);
    box(parts,instances,'EntranceCanopy','Bronze aluminium','canopy',
      8200,3200,220,0,-12000,3000);
    // Readable podium, roof-garden edges and serviced roof.
    box(parts,instances,'PodiumTerraceWest','Limestone','terrace',
      9900,17600,140,-30000,0,-140);
    box(parts,instances,'PodiumTerraceEast','Limestone','terrace',
      9900,17600,140,30000,0,-140);
    for(let i=0;i<6;i++){
      box(parts,instances,'TerracePlanter'+i,'Charcoal precast','planter',
        1300,1800,620,(i-2.5)*7300,12100,-80);
    }
    for(let i=0;i<4;i++){
      box(parts,instances,'RoofGardenPlanter'+i,'Charcoal precast','roof-garden',
        3100,850,640,(i-1.5)*11800,9100,FIRST+7*STOREY+270);
    }
    box(parts,instances,'LiftOverrun','Limestone','roof-service',5200,5400,3200,
      -5100,0,FIRST+7*STOREY+280);
    box(parts,instances,'PlantScreen','Perforated bronze','roof-screen',12400,190,2500,
      5200,-5500,FIRST+7*STOREY+270);
    box(parts,instances,'LobbyFeatureWall','Dark stone','lobby-wall',
      9200,250,3400,-13700,-9300,0);
    box(parts,instances,'EntranceDoor','Glazing','entrance',3200,70,3280,
      0,-10750,0);
    box(parts,instances,'CanopyFasciaFront','Bronze aluminium','canopy-edge',
      8200,140,340,0,-13530,3000);
    box(parts,instances,'CanopyFasciaSides','Bronze aluminium','canopy-edge',
      140,3200,340,-4150,-12000,3000);
    box(parts,instances,'RoofParapetNorth','Limestone','parapet',
      48400,280,620,0,10380,FIRST+7*STOREY+280);
    box(parts,instances,'RoofParapetSouth','Limestone','parapet',
      48400,280,620,0,-10380,FIRST+7*STOREY+280);
  }else{
    const accessible=key==='suite-accessible';
    const corner=key==='suite-corner';
    const jamb=(R_W-windowWidthMm)/2;
    const yFacade=R_D-80;
    box(parts,instances,'GuestroomSlab','Concrete','floor',
      R_W-50,R_D,180,0,R_D/2,0);
    box(parts,instances,'PartyWallLeft','Warm plaster','partition',
      120,R_D,3160,-R_W/2+60,R_D/2,180);
    box(parts,instances,'PartyWallRight','Warm plaster','partition',
      120,R_D,3160,R_W/2-60,R_D/2,180);
    box(parts,instances,'FacadeLeft','Terracotta','facade',
      jamb,160,3220,-windowWidthMm/2-jamb/2,yFacade,180);
    box(parts,instances,'FacadeRight','Terracotta','facade',
      jamb,160,3220,windowWidthMm/2+jamb/2,yFacade,180);
    box(parts,instances,'FacadeSill','Terracotta','facade',
      windowWidthMm,160,720,0,yFacade,180);
    box(parts,instances,'FacadeHead','Terracotta','facade',
      windowWidthMm,160,650,0,yFacade,2750);
    box(parts,instances,'Balcony','Concrete','balcony',
      R_W-120,750,160,0,R_D+375,0);
    const bW=accessible?2500:2100;
    box(parts,instances,'BathroomPod','Timber','interior',
      bW,2200,2580,corner?420:-420,1750,180);
    box(parts,instances,'BedPlatform','Timber','interior',
      1850,2200,360,0,5400,180);
    // Build a more legible, constructible elevation around the actual
    // window aperture. Parts are still parametric Loft sketch/extrude solids,
    // not drawn-on decorative textures.
    box(parts,instances,'WindowRevealLeft','Dark stone','reveal',70,210,1850,
      -windowWidthMm/2-42,yFacade-90,900);
    box(parts,instances,'WindowRevealRight','Dark stone','reveal',70,210,1850,
      windowWidthMm/2+42,yFacade-90,900);
    box(parts,instances,'WindowSillFlash','Anodised bronze','flashing',
      windowWidthMm+120,400,35,0,yFacade-40,866);
    box(parts,instances,'WindowHeadFlash','Anodised bronze','flashing',
      windowWidthMm+120,360,35,0,yFacade-30,2750);
    box(parts,instances,'FacadeFinnedLeft','Anodised bronze','facade-fin',
      95,410,3000,-R_W/2+130,yFacade-180,220);
    box(parts,instances,'FacadeFinnedRight','Anodised bronze','facade-fin',
      95,410,3000,R_W/2-130,yFacade-180,220);
    box(parts,instances,'BalconyEdge','Dark stone','balcony-edge',
      R_W-120,90,190,0,R_D+720,0);
    box(parts,instances,'SpandrelBand','Limestone','spandrel',
      R_W-80,170,110,0,yFacade+40,2990);
    if(corner)box(parts,instances,'CornerFin','Bronze aluminium','facade-fin',
      90,350,3220,R_W/2-50,R_D-290,180);
  }
  return {id:'Riverside-'+key,schemaVersion:SOURCE_VERSION as 2,units:'mm',
    parts,rootAssembly:'Root',
    assemblies:[{id:'Root',instances}]};
}
export function makeHotelModule(key:HotelModuleKey,revision=0,
  windowWidthMm=1800):HotelSourceModule{
  const loftProject=makeHotelLoftSource(key,windowWidthMm);
  return {
    contract:'plasma.loft-linked-subproject/0.1',
    sourceProjectId:loftProject.id,moduleKey:key,
    displayName:{
      'suite-standard':'Standard guest suite',
      'suite-accessible':'Accessible guest suite',
      'suite-corner':'Corner guest suite',
      'window-a4':'A4 window system',
      'building-shell':'Hotel structure and podium',
    }[key],
    revision,windowWidthMm,loftProject,
    sourceHash:hashSourceBytes(JSON.stringify(loftProject)),
    verification:'source-preserved-native-pending',
  };
}
function metadata(raw:Record<string,unknown>,contract:string){
  const value=raw['metadata'];
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('HOTEL_SOURCE_METADATA_INVALID');
  const data=value as Record<string,unknown>;
  if(data['contract']!==contract)
    throw new Error('HOTEL_SOURCE_CONTRACT_MISMATCH');
  return data;
}
export interface ResolvedHotel {
  readonly hotelId:string;
  readonly manifest:HotelManifest;
  readonly modules:ReadonlyMap<string,HotelSourceModule>;
}
export async function resolveHotel(store:VersionStore,branchId:string,
  hotelId:string=RIVERSIDE_HOTEL_ID):Promise<ResolvedHotel>{
  const raw=await asPromise(store.getObject(branchId,hotelId));
  if(!raw||raw['semanticType']!=='plasma.hotel.project')
    throw new Error('HOTEL_PROJECT_NOT_FOUND');
  const manifest=metadata(raw,'plasma.hotel-linked-project/0.1') as unknown as HotelManifest;
  if(manifest.keys!==168||manifest.rooms?.length!==168||
    !Array.isArray(manifest.subprojectIds)||manifest.subprojectIds.length!==5)
    throw new Error('HOTEL_MANIFEST_INVALID');
  const modules=new Map<string,HotelSourceModule>();
  for(const id of manifest.subprojectIds){
    const object=await asPromise(store.getObject(branchId,id));
    if(!object||object['semanticType']!=='plasma.loft.subproject')
      throw new Error('HOTEL_SUBPROJECT_NOT_FOUND: '+id);
    const source=metadata(object,'plasma.loft-linked-subproject/0.1') as unknown as HotelSourceModule;
    if(id!==hotelModuleId(source.moduleKey)||source.sourceHash!==
      hashSourceBytes(JSON.stringify(source.loftProject)))
      throw new Error('HOTEL_SUBPROJECT_HASH_OR_ID_MISMATCH: '+id);
    modules.set(id,source);
  }
  if(new Set(manifest.rooms.map(r=>r.id)).size!==168||
     manifest.rooms.some(r=>!modules.has(r.moduleId)||!modules.has(r.windowModuleId)))
    throw new Error('HOTEL_ROOM_SOURCE_LINK_BROKEN');
  const width=modules.get(hotelModuleId('window-a4'))!.windowWidthMm;
  for(const source of modules.values())if(source.moduleKey!=='building-shell' &&
    source.windowWidthMm!==width)
    throw new Error('HOTEL_UNSYNCHRONISED_WINDOW_DRIVERS');
  return {hotelId,manifest,modules};
}
function wrap(id:string,name:string,semanticType:string,
  metadata:HotelManifest|HotelSourceModule,now:string):HotelStoredObject{
  return {id,kind:'Model',semanticType,name,schemaVersion:'1.0.0',
    createdAt:now,updatedAt:now,metadata};
}
function errorText(e:unknown):string{
  return e instanceof Error?e.message:'Hotel mutation failed';
}
export async function bootstrapHotel(
  store:VersionStore,body:{modelId:string;branchId:string;expectedHeadHash:string},
){
  const head=await asPromise(store.getBranchHead(body.branchId));
  if(head.modelId!==body.modelId||head.headHash!==body.expectedHeadHash)
    throw new Error('HOTEL_HEAD_CONFLICT');
  const manifest=makeHotelManifest();
  const now=new Date().toISOString();
  const objects=[
    wrap(RIVERSIDE_HOTEL_ID,'Riverside Hotel','plasma.hotel.project',manifest,now),
    ...HOTEL_MODULE_IDS.map(key=>wrap(
      hotelModuleId(key),makeHotelModule(key).displayName,
      'plasma.loft.subproject',makeHotelModule(key),now)),
  ];
  const event=await asPromise(store.applyMutation({
    branchId:body.branchId,actor:{type:'user',id:'northstar-hotel'},
    command:'HOTEL_BOOTSTRAP_LINKED_SUBPROJECTS',
    expectedHeadHash:body.expectedHeadHash,
    targetIds:objects.map(o=>o.id),
    reason:'Create a versioned hotel parent and five separately addressed Loft module sources',
    mutate:items=>{
      if(objects.some(item=>items.has(item.id)))
        throw new Error('HOTEL_ALREADY_EXISTS');
      for(const item of objects)items.set(item.id,item as unknown as Record<string,unknown>);
      return objects.map(o=>o.id);
    },
  }));
  return {
    status:'linked-hotel-created' as const,hotelId:RIVERSIDE_HOTEL_ID,
    headHash:event.afterHash,eventId:event.eventId,keys:168,storeys:8,
    moduleCount:5,instanceLinks:168*2+1,publicationReady:false,
  };
}
export async function reviseHotelWindows(
  store:VersionStore,body:{
    modelId:string;branchId:string;expectedHeadHash:string;
    hotelId:string;nextWidthMm:number;
  },
){
  const head=await asPromise(store.getBranchHead(body.branchId));
  if(head.modelId!==body.modelId||head.headHash!==body.expectedHeadHash)
    throw new Error('HOTEL_HEAD_CONFLICT');
  if(!Number.isFinite(body.nextWidthMm)||body.nextWidthMm<1200||
    body.nextWidthMm>2500)
    throw new Error('HOTEL_WINDOW_WIDTH_OUT_OF_DOMAIN');
  const hotel=await resolveHotel(store,body.branchId,body.hotelId);
  const current=hotel.modules.get(hotelModuleId('window-a4'))!;
  if(body.nextWidthMm===current.windowWidthMm)
    throw new Error('HOTEL_NO_GEOMETRY_CHANGE');
  const now=new Date().toISOString();
  const moduleIds=HOTEL_MODULE_IDS.filter(k=>k!=='building-shell').map(hotelModuleId);
  const nextRecords=moduleIds.map(id=>{
    const old=hotel.modules.get(id)!;
    const next=makeHotelModule(old.moduleKey,old.revision+1,body.nextWidthMm);
    return {id,next};
  });
  const event=await asPromise(store.applyMutation({
    branchId:body.branchId,actor:{type:'user',id:'northstar-hotel'},
    command:'HOTEL_REVISE_LINKED_WINDOW_SYSTEM',
    expectedHeadHash:body.expectedHeadHash,
    targetIds:moduleIds,
    reason:'Update A4 window width and three hosted suite opening sources together',
    mutate:items=>{
      // Preflight every source before writing any object. InMemoryVersionStore
      // mutates the supplied map directly, so a throwing validation pass must
      // never leave a partially updated linked module library.
      for(const {id} of nextRecords){
        const old=items.get(id);
        if(!old||old['semanticType']!=='plasma.loft.subproject')
          throw new Error('HOTEL_LINKED_MODULE_CHANGED');
        const source=metadata(old,'plasma.loft-linked-subproject/0.1') as unknown as HotelSourceModule;
        const expected=hotel.modules.get(id);
        if(source.sourceHash!==expected?.sourceHash||source.revision!==expected.revision)
          throw new Error('HOTEL_LINKED_SOURCE_STALE');
      }
      for(const {id,next} of nextRecords){
        items.set(id,{...items.get(id)!,updatedAt:now,metadata:next});
      }
      return moduleIds;
    },
  }));
  return {
    status:'linked-source-revision-accepted' as const,
    headHash:event.afterHash,eventId:event.eventId,
    oldWidthMm:current.windowWidthMm,newWidthMm:body.nextWidthMm,
    revisedModuleIds:moduleIds,
    affectedRoomCount:168,affectedWindowCount:168,
    publicationReady:false,
  };
}
export function hotelError(e:unknown):{status:number;failureCode:string;summary:string}{
  const summary=errorText(e);
  return {
    status:/HEAD_CONFLICT|_STALE|ALREADY_EXISTS/.test(summary)?409:422,
    failureCode:'HOTEL_OPERATION_REJECTED',summary,
  };
}
