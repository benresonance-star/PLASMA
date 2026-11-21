import { composeFirstFusion, hashSourceBytes } from '@spds/import-core';
import {
  InProcessGeometryKernel, executeExactCompile,
  type GeometryCompileMesh,
} from '@spds/geometry-contracts';
import {
  planFusionNativeAssembly, verifyFusionNativeAssembly,
  type AssemblySourcePart,
} from './fusion-assembly.js';
import {
  hotelModuleId, type HotelManifest, type HotelRoom, type HotelSourceModule,
  type ResolvedHotel,
} from './hotel-project.js';

export interface HotelDisplayMesh {
  readonly representationId:string;
  readonly semanticOwner:string;
  readonly material:string;
  readonly sourceModuleId:string;
  readonly vertices:readonly (readonly [number,number,number])[];
  readonly indices:readonly number[];
}
type OriginalMesh = GeometryCompileMesh & {readonly material?:string};
interface SourceCompiled {
  readonly moduleId:string;
  readonly sourceHash:string;
  readonly nativeVerified:boolean;
  readonly partCount:number;
  readonly parts:readonly AssemblySourcePart[];
  readonly meshes:readonly GeometryCompileMesh[];
}
const demoBuild={
  app:'Build',schemaVersion:2,savedAt:'2026-11-21T00:00:00.000Z',
  authoritativeGraph:{entities:[],parameters:[],relationships:[]},
};
const moduleCache=new Map<string,Promise<SourceCompiled>>();
export function clearHotelCompilerCache(){moduleCache.clear();}
function classify(material:string):string{
  const x=material.toLowerCase();
  if(x.includes('glaz'))return 'glass';
  if(x.includes('alumini'))return 'metal';
  if(x.includes('terracotta'))return 'facade';
  if(x.includes('concrete'))return 'concrete';
  if(x.includes('stone'))return 'stone';
  if(x.includes('timber'))return 'timber';
  return 'plaster';
}
function sourceInput(module:HotelSourceModule){
  const loftProject=module.loftProject;
  const preview=composeFirstFusion({buildProject:demoBuild,loftProject,bindings:[]});
  return {
    buildProject:demoBuild,loftProject,bindings:[],
    expectedSourceHashes:{
      build:preview.sources.find(s=>s.system==='build')!.sourceHash,
      loft:preview.sources.find(s=>s.system==='loft')!.sourceHash,
    },
  };
}
async function compileModule(module:HotelSourceModule,kernel:'exact-adapter'|'occt-native',
  serviceUrl:string):Promise<SourceCompiled>{
  const cacheKey=module.sourceHash+'|'+kernel+'|'+(kernel==='occt-native'?serviceUrl:'local');
  let promise=moduleCache.get(cacheKey);
  if(!promise){
    promise=(async()=>{
      const source=sourceInput(module);
      const planned=planFusionNativeAssembly(source);
      if(kernel==='exact-adapter'){
        const result=executeExactCompile(new InProcessGeometryKernel(),planned.request);
        return {
          moduleId:hotelModuleId(module.moduleKey),sourceHash:module.sourceHash,
          nativeVerified:false,partCount:planned.parts.length,
          parts:planned.parts,meshes:result.meshes,
        };
      }
      if(!serviceUrl)throw new Error('HOTEL_NATIVE_SERVICE_REQUIRED');
      const result=await verifyFusionNativeAssembly({
        source,serviceUrl,timeoutMs:45_000,
      });
      return {
        moduleId:hotelModuleId(module.moduleKey),sourceHash:module.sourceHash,
        nativeVerified:true,partCount:result.partCount,
        parts:result.parts,meshes:result.meshes,
      };
    })();
    moduleCache.set(cacheKey,promise);
    void promise.catch(()=>moduleCache.delete(cacheKey));
  }
  return promise;
}
function merge(semanticOwner:string,material:string,moduleId:string,
  meshes:readonly HotelDisplayMesh[]):HotelDisplayMesh{
  const vertices:[number,number,number][]=[];
  const indices:number[]=[];
  for(const mesh of meshes){
    const base=vertices.length;
    for(const p of mesh.vertices)vertices.push([...p] as [number,number,number]);
    for(const idx of mesh.indices)indices.push(base+idx);
  }
  return {
    representationId:'repr:hotel:'+hashSourceBytes(semanticOwner+'|'+material+'|'+
      meshes.map(m=>m.representationId).join('|')).slice(0,20),
    semanticOwner,material,sourceModuleId:moduleId,
    vertices,indices,
  };
}
function transform(mesh:GeometryCompileMesh,room:HotelRoom,
  localOffset:readonly [number,number,number],material:string,moduleId:string):HotelDisplayMesh{
  const s=room.rotationDeg===0?1:-1;
  const vertices=mesh.vertices.map(([x,y,z])=>
    [room.xMm+s*(x+localOffset[0]),room.yMm+s*(y+localOffset[1]),
      room.zMm+z+localOffset[2]] as const);
  return {
    representationId:mesh.representationId+'@'+room.id+':'+moduleId,
    semanticOwner:room.id,material,sourceModuleId:moduleId,
    vertices,indices:mesh.indices,
  };
}
function makeRoomMeshes(room:HotelRoom,module:SourceCompiled,windows:SourceCompiled,
  fullInterior:boolean):HotelDisplayMesh[]{
  const sourceGroups=new Map<string,HotelDisplayMesh[]>();
  const append=(compiled:SourceCompiled,offset:readonly [number,number,number],
    allowed:(role:string)=>boolean)=>{
    const owners=new Map(compiled.parts.map(p=>[p.semanticOwner,p]));
    for(const solid of compiled.meshes){
      const part=owners.get(solid.semanticOwner);
      if(!part)throw new Error('HOTEL_NATIVE_PART_LINEAGE_MISSING');
      const sourceRole=part.sourcePartId.toLowerCase();
      const material=classify(part.material);
      const isInternal=['bathroompod','bedplatform','partywallleft','partywallright',
        'guestroomslab'].some(t=>sourceRole===t);
      if(!allowed(sourceRole)||(!fullInterior&&isInternal))continue;
      const placed=transform(solid,room,offset,material,compiled.moduleId);
      const list=sourceGroups.get(material)??[];
      list.push(placed);
      sourceGroups.set(material,list);
    }
  };
  append(module,[0,0,0],()=>true);
  append(windows,[0,8100,900],()=>true);
  const result:HotelDisplayMesh[]=[];
  for(const [material,list] of sourceGroups)result.push(merge(room.id,material,
    list[0]!.sourceModuleId,list));
  return result;
}
function shellMeshes(source:SourceCompiled):HotelDisplayMesh[]{
  const lookup=new Map(source.parts.map(p=>[p.semanticOwner,p]));
  return source.meshes.map(mesh=>{
    const part=lookup.get(mesh.semanticOwner);
    if(!part)throw new Error('HOTEL_SHELL_LINEAGE_MISSING');
    return {
      representationId:'repr:hotel:shell:'+part.sourcePartId+':'+source.sourceHash.slice(0,10),
      semanticOwner:'entity:hotel:shell:'+part.sourceInstanceId,
      material:classify(part.material),sourceModuleId:source.moduleId,
      vertices:mesh.vertices,indices:mesh.indices,
    };
  });
}
export interface HotelScene {
  readonly status:'linked-hotel-scene';
  readonly kernel:'exact-adapter'|'occt-native';
  readonly nativeVerified:boolean;
  readonly hotelId:string;
  readonly headHash:string;
  readonly manifest:HotelManifest;
  readonly windowWidthMm:number;
  readonly modules:readonly {
    readonly id:string;readonly name:string;readonly revision:number;
    readonly sourceHash:string;readonly partCount:number;readonly nativeVerified:boolean;
  }[];
  readonly compiledUniqueSolidCount:number;
  readonly roomCount:number;
  readonly sceneObjectCount:number;
  readonly meshes:readonly HotelDisplayMesh[];
  readonly drawings:{
    readonly planSvg:string;readonly sectionSvg:string;
    readonly planHash:string;readonly sectionHash:string;
    readonly issueStatus:'schematic-not-for-construction';
  };
  readonly unresolved:readonly string[];
}
export async function buildHotelScene(input:{
  hotel:ResolvedHotel;
  headHash:string;
  kernel:'exact-adapter'|'occt-native';
  serviceUrl:string;
  selectedLevel:number;
  mode:'exterior'|'floor';
}):Promise<HotelScene>{
  const {hotel,kernel,serviceUrl,selectedLevel,mode}=input;
  if(selectedLevel<1||selectedLevel>7||!Number.isInteger(selectedLevel))
    throw new Error('HOTEL_LEVEL_OUT_OF_RANGE');
  const compiled=new Map<string,SourceCompiled>();
  for(const [id,module] of hotel.modules){
    // Serial native compilation limits memory and reuses one OCCT service kernel.
    const result=await compileModule(module,kernel,serviceUrl);
    compiled.set(id,result);
  }
  if(compiled.size!==5)throw new Error('HOTEL_SUBPROJECT_COMPILATION_INCOMPLETE');
  const shell=compiled.get(hotelModuleId('building-shell'))!;
  const windows=compiled.get(hotelModuleId('window-a4'))!;
  // Exterior: all 168 façade modules. Floor study: isolate exactly one
  // level and its supporting slab so interiors are inspectable, not hidden
  // behind the roof or upper storeys.
  const selectedSlab=selectedLevel===1?'LobbyRoof':'FloorBand'+(selectedLevel-1);
  const meshes:HotelDisplayMesh[]=mode==='floor'
    ?shellMeshes(shell).filter(mesh=>mesh.representationId.includes(':'+selectedSlab+':'))
    :shellMeshes(shell);
  for(const room of hotel.manifest.rooms){
    if(mode==='floor' && room.level!==selectedLevel)continue;
    const suite=compiled.get(room.moduleId);
    if(!suite)throw new Error('HOTEL_ROOM_SUBPROJECT_UNRESOLVED');
    meshes.push(...makeRoomMeshes(room,suite,windows,mode==='floor'&&room.level===selectedLevel));
  }
  const panel=hotel.modules.get(hotelModuleId('window-a4'))!;
  const drawings=hotelDrawings(hotel.manifest,panel.windowWidthMm,selectedLevel);
  return {
    status:'linked-hotel-scene',kernel,nativeVerified:kernel==='occt-native',
    hotelId:hotel.hotelId,headHash:input.headHash,manifest:hotel.manifest,
    windowWidthMm:panel.windowWidthMm,
    modules:[...hotel.modules].map(([id,src])=>({
      id,name:src.displayName,revision:src.revision,
      sourceHash:src.sourceHash,partCount:src.loftProject.parts.length,
      nativeVerified:compiled.get(id)!.nativeVerified,
    })),
    compiledUniqueSolidCount:[...compiled.values()].reduce((n,c)=>n+c.partCount,0),
    roomCount:hotel.manifest.rooms.length,
    sceneObjectCount:meshes.length,
    meshes,drawings,
    unresolved:[
      'Hotel is a designed synthetic test site, not an observed or registered real property',
      'Module sources are editable Loft sketch/extrusion subprojects; full G110 history is not integrated',
      'Native B-rep validates source solids, but replicated placements use a deterministic display transform',
      'Plan and section are geometrically linked schematic drawings, not issueable construction documents',
      'No structural, envelope, fire, egress, access, energy or IFC4X3 certification',
    ],
  };
}
function svgEsc(text:string):string{
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function hotelDrawings(manifest:HotelManifest,windowWidthMm:number,level:number){
  const accent='#b3563c',ink='#293838',muted='#778783',line='#adb7b0';
  const W=1240,H=490,rx=75,ry=68,roomW=86,roomD=138,corridor=45;
  const blocks:string[]=[];
  for(const room of manifest.rooms.filter(r=>r.level===level)){
    const x=rx+room.bay*roomW;
    const top=room.side==='north'?ry:ry+roomD+corridor;
    const key=room.moduleId.includes('corner')?'COR':room.moduleId.includes('accessible')?'ACC':'STD';
    const win=windowWidthMm/3900*(roomW-4);
    const wy=room.side==='north'?top+roomD:top;
    const selected=room.bay===11&&room.side==='north';
    blocks.push(
      '<rect x="'+x+'" y="'+top+'" width="'+roomW+'" height="'+roomD+
      '" fill="'+(selected?'#fff0e8':'#f5f4ec')+'" stroke="'+line+'" stroke-width="1.25"/>',
      '<line x1="'+(x+roomW/2-win/2)+'" y1="'+wy+'" x2="'+
      (x+roomW/2+win/2)+'" y2="'+wy+'" stroke="'+accent+'" stroke-width="5"/>',
      '<text x="'+(x+roomW/2)+'" y="'+(top+59)+
      '" text-anchor="middle" font-size="10" fill="'+ink+'">'+
      svgEsc('L'+level+(room.side==='north'?'N':'S')+
      String(room.bay+1).padStart(2,'0'))+'</text>',
      '<text x="'+(x+roomW/2)+'" y="'+(top+75)+
      '" text-anchor="middle" font-size="8" fill="'+muted+'">'+key+'</text>',
      selected?'<rect x="'+(x+3)+'" y="'+(top+3)+'" width="'+(roomW-6)+
      '" height="'+(roomD-6)+'" fill="none" stroke="'+accent+
      '" stroke-width="2.5" stroke-dasharray="6 4"/>':'',
    );
  }
  const plan='<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="490" viewBox="0 0 1240 490">'+
    '<rect width="1240" height="490" fill="#fbfaf6"/>'+
    '<text x="45" y="31" font-size="18" font-weight="700" fill="'+ink+
    '">RIVERSIDE HOTEL · LEVEL '+String(level).padStart(2,'0')+' · ROOM PLAN</text>'+
    '<text x="1175" y="31" font-size="11" text-anchor="end" fill="'+muted+'">168 KEYS · 24 PER FLOOR</text>'+
    '<rect x="'+rx+'" y="'+(ry+roomD)+'" width="'+(12*roomW)+
    '" height="'+corridor+'" fill="#dae2de" stroke="'+line+'"/>'+
    '<text x="588" y="'+(ry+roomD+28)+'" text-anchor="middle" font-size="12" fill="'+ink+
    '">CENTRAL GUEST CORRIDOR · 3000 mm</text>'+
    blocks.join('')+
    '<path d="M 1130 75 L 1130 47 L 1118 62 M 1130 47 L 1142 62" stroke="'+ink+
    '" stroke-width="2.2" fill="none"/><text x="1146" y="52" fill="'+ink+'" font-size="11">N</text>'+
    '<line x1="75" y1="439" x2="245" y2="439" stroke="'+ink+'" stroke-width="3"/>'+
    '<text x="75" y="459" font-size="10" fill="'+muted+'">1 BAY = 3900 mm</text>'+
    '<text x="1145" y="466" text-anchor="end" font-size="11" font-weight="700" fill="'+accent+
    '">SCHEMATIC / NOT FOR CONSTRUCTION</text></svg>';
  const sectParts:string[]=[];
  for(let n=0;n<7;n++){
    const y=385-n*46;
    sectParts.push(
      '<rect x="220" y="'+(y-4)+'" width="720" height="7" fill="#bdc4bd"/>',
      '<rect x="220" y="'+(y-44)+'" width="12" height="40" fill="#ae8975"/>',
      '<rect x="928" y="'+(y-44)+'" width="12" height="40" fill="#ae8975"/>',
      '<rect x="219" y="'+(y-35)+'" width="13" height="26" fill="#628596"/>',
      '<rect x="928" y="'+(y-35)+'" width="13" height="26" fill="#628596"/>',
      '<text x="164" y="'+(y-7)+'" font-size="11" fill="'+ink+'">L'+(n+1)+'</text>',
    );
  }
  const section='<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="490" viewBox="0 0 1240 490">'+
    '<rect width="1240" height="490" fill="#fbfaf6"/>'+
    '<text x="45" y="31" font-size="18" font-weight="700" fill="'+ink+
    '">RIVERSIDE HOTEL · SECTION THROUGH MODULAR SUITES</text>'+
    '<text x="1175" y="31" font-size="11" text-anchor="end" fill="'+muted+'">A4 WINDOW / '+windowWidthMm+' mm</text>'+
    '<rect x="185" y="386" width="800" height="49" fill="#d3d7ce" stroke="'+line+'"/>'+
    '<rect x="215" y="396" width="10" height="35" fill="#aa9484"/>'+
    sectParts.join('')+
    '<rect x="210" y="51" width="740" height="13" fill="#8e9693"/>'+
    '<text x="955" y="91" fill="'+ink+'" font-size="10">Roof · non-issued detail</text>'+
    '<path d="M 235 186 L 340 186" stroke="'+accent+'" stroke-width="2"/>'+
    '<text x="342" y="184" fill="'+accent+'" font-size="11">Facade windows</text>'+
    '<path d="M 540 67 L 540 386" stroke="'+line+'" stroke-width="1" stroke-dasharray="6 5"/>'+
    '<text x="540" y="407" text-anchor="middle" fill="'+muted+'" font-size="11">CENTRAL CORRIDOR</text>'+
    '<text x="1145" y="466" text-anchor="end" font-size="11" font-weight="700" fill="'+accent+
    '">SCHEMATIC / NOT FOR CONSTRUCTION</text></svg>';
  return {
    planSvg:plan,sectionSvg:section,
    planHash:hashSourceBytes(plan),sectionHash:hashSourceBytes(section),
    issueStatus:'schematic-not-for-construction' as const,
  };
}
