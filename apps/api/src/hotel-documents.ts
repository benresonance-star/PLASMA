import { hashSourceBytes } from '@spds/import-core';
import type { HotelManifest, HotelSourceModule } from './hotel-project.js';

interface ModuleSet {
  readonly window:HotelSourceModule;
  readonly standard:HotelSourceModule;
  readonly accessible:HotelSourceModule;
  readonly corner:HotelSourceModule;
}
export interface HotelDrawing {
  readonly id:string;
  readonly name:string;
  readonly viewType:'elevation'|'detail'|'schedule';
  readonly sourceIds:readonly string[];
  readonly sourceHash:string;
  readonly revision:number;
  readonly issueStatus:'study-not-for-construction';
}
export interface HotelScheduleRow {
  readonly id:string;readonly description:string;
  readonly quantity:number;readonly nominalWidthMm:number;
  readonly nominalHeightMm:number;readonly nominalGlazingAreaM2:number;
  readonly sourceId:string;
}
export interface HotelArchitectureDocuments {
  readonly elevationSvg:string;readonly elevationHash:string;
  readonly junctionSvg:string;readonly junctionHash:string;
  readonly scheduleRows:readonly HotelScheduleRow[];
  readonly scheduleHash:string;
  readonly registry:readonly HotelDrawing[];
  readonly issueStatus:'study-not-for-construction';
}
function escapeSvg(s:string):string{
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function part(source:HotelSourceModule,id:string){
  const found=source.loftProject.parts.find(p=>p.id===id);
  if(!found)throw new Error('HOTEL_DRAWING_SOURCE_PART_MISSING: '+source.sourceProjectId+'/'+id);
  return found;
}
function svgBase(title:string,subtitle:string,content:string,width=1240,height=490){
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+
    '" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
    '<rect width="'+width+'" height="'+height+'" fill="#fbfaf6"/>'+
    '<path d="M 18 55 H '+(width-18)+'" stroke="#b7c3b7" stroke-width="1.5"/>'+
    '<text x="28" y="27" font-size="19" font-family="Arial" fill="#2c3d3e" font-weight="700">'+
    escapeSvg(title)+'</text>'+
    '<text x="28" y="44" font-size="10" fill="#8d6854">'+escapeSvg(subtitle)+'</text>'+
    content+
    '<rect x="16" y="'+(height-35)+'" width="'+(width-32)+
    '" height="23" fill="#f1eae2" stroke="#ccab90"/>'+
    '<text x="25" y="'+(height-20)+'" font-size="10" font-weight="700" fill="#a8523a">'+
    'SOURCE-DERIVED DESIGN STUDY / NOT FOR CONSTRUCTION</text>'+
    '</svg>';
}
function facadeElevation(manifest:HotelManifest,windowWidthMm:number){
  const items:string[]=[];
  const x0=80,y0=92,dx=81,dy=44,baseY=y0+7*dy;
  items.push(
    '<rect x="55" y="'+(y0-18)+'" width="1030" height="'+(7*dy+55)+
    '" fill="#c8b9a7" stroke="#767b73" stroke-width="3"/>',
    '<rect x="55" y="'+(baseY-15)+'" width="1030" height="65" fill="#505b59"/>',
  );
  for(const room of manifest.rooms.filter(r=>r.side==='north')){
    const x=x0+room.bay*dx,y=y0+(7-room.level)*dy;
    const w=(windowWidthMm/3900)*60;
    const isCorner=room.moduleId.includes('corner');
    const stroke=isCorner?'#b35c3e':'#8f654e';
    items.push(
      '<g id="'+escapeSvg(room.id)+'" data-semantic-id="'+escapeSvg(room.id)+'">',
      '<rect x="'+x+'" y="'+(y-8)+'" width="69" height="39" fill="#d1c7b5"/>',
      '<rect x="'+(x+34.5-w/2)+'" y="'+(y-1)+'" width="'+w+
      '" height="26" fill="#71939c" stroke="'+stroke+'" stroke-width="3"/>',
      '<line x1="'+(x+34.5)+'" y1="'+(y-1)+'" x2="'+(x+34.5)+
      '" y2="'+(y+25)+'" stroke="#a78a6a" stroke-width="2.5"/>',
      '<path d="M '+(x+2)+' '+(y+28)+' h 65" stroke="#a79d91" stroke-width="3"/>',
      '<text x="'+(x+34.5)+'" y="'+(y+39)+
      '" text-anchor="middle" font-size="6.4" fill="#404d48">'+
      escapeSvg('L'+room.level+'N'+String(room.bay+1).padStart(2,'0'))+'</text>',
      '</g>',
    );
  }
  for(let i=0;i<8;i++)items.push(
    '<line x1="50" y1="'+(y0+i*dy-19)+'" x2="1087" y2="'+(y0+i*dy-19)+
    '" stroke="#f4f2eb" stroke-width="3"/>');
  items.push(
    '<path d="M 1110 82 H 1165 M 1110 82 V 399" stroke="#78938a" stroke-width="1.5"/>',
    '<text x="1093" y="85" font-size="9" fill="#596d63">ROOF</text>',
    '<text x="1095" y="400" font-size="9" fill="#596d63">PODIUM</text>',
    '<text x="72" y="430" font-size="10" fill="#ac573d">NORTH FACADE / 84 OF 168 WINDOW OCCURRENCES SHOWN</text>',
  );
  return svgBase('RIVERSIDE HOTEL · NORTH FACADE ELEVATION',
    'Identity-linked A4 system / width '+windowWidthMm+' mm / seven guestroom levels',
    items.join(''));
}
function hatched(x:number,y:number,w:number,h:number,color:string,spacing=10){
  const lines:string[]=[];
  for(let i=-h;i<w+h;i+=spacing){
    lines.push('<path d="M '+(x+i)+' '+(y+h)+' l '+h+' -'+h+
      '" stroke="'+color+'" stroke-width=".8" opacity=".58"/>');
  }
  return '<g><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
    '" fill="'+color+'" opacity=".22"/>'+lines.join('')+'</g>';
}
function junctionDrawing(source:HotelSourceModule,standard:HotelSourceModule){
  const width=source.windowWidthMm;
  const sash=part(source,'FrameHead'),glass=part(source,'Glass'),
    breakHead=part(source,'ThermalBreakHead'),
    flash=part(standard,'WindowHeadFlash'),
    face=part(standard,'FacadeHead');
  // A source-derived diagram of a 650 mm window-head zone. Proportions use
  // authored part thicknesses; adjacency is illustrative, not a certified
  // waterproofing detail. The output is explicitly NTS until authored details
  // and weather-resistance validation exist.
  const mmToPx=.56;
  const outer=face.parameters.H*mmToPx;
  const metal=sash.parameters.H*mmToPx;
  const thermal=breakHead.parameters.H*mmToPx;
  const glazing=glass.parameters.H*mmToPx;
  const lead=flash.parameters.H*mmToPx;
  const x=270,y=110;
  const drawing=[
    hatched(160,82,115,290,'#a88f75',9),
    '<rect x="'+x+'" y="'+y+'" width="'+outer+
      '" height="225" fill="#c4ac96" stroke="#846852" stroke-width="2"/>',
    '<rect x="'+(x+outer)+'" y="'+(y+42)+'" width="'+metal+
      '" height="183" fill="#96765a" stroke="#513a2b" stroke-width="2"/>',
    '<rect x="'+(x+outer+metal)+'" y="'+(y+61)+'" width="'+thermal+
      '" height="164" fill="#e4d29c" stroke="#8f8868"/>',
    '<rect x="'+(x+outer+metal+thermal)+'" y="'+(y+63)+'" width="'+glazing+
      '" height="161" fill="#86a6ab" stroke="#486c77" stroke-width="2"/>',
    '<rect x="'+(x-9)+'" y="'+(y+225)+'" width="'+(outer+metal+thermal+glazing+lead)+'" height="10" fill="#a6704e"/>',
    '<path d="M 160 118 L 142 118 L 142 357 L 160 357" fill="none" stroke="#486a69" stroke-width="2"/>',
    '<path d="M 405 94 L 425 94 L 425 367" fill="none" stroke="#b45b3d" stroke-width="1.3" stroke-dasharray="5 5"/>',
    '<path d="M 160 406 H 650 M 160 401 V 411 M 650 401 V 411" fill="none" stroke="#4a5752" stroke-width="1"/>',
    '<text x="405" y="424" font-size="10" fill="#637870" text-anchor="middle">PART-DEFINED MATERIAL THICKNESS / NOT PLOT SCALE</text>',
    '<path d="M 470 122 H 560" stroke="#9d593e"/><text x="568" y="125" font-size="11" fill="#4d605b">Facade head</text>',
    '<path d="M 410 160 H 560" stroke="#9d593e"/><text x="568" y="163" font-size="11" fill="#4d605b">A4 frame head</text>',
    '<path d="M 390 198 H 560" stroke="#9d593e"/><text x="568" y="201" font-size="11" fill="#4d605b">Thermal isolation</text>',
    '<path d="M 408 236 H 560" stroke="#9d593e"/><text x="568" y="239" font-size="11" fill="#4d605b">Insulated glazing</text>',
    '<path d="M 420 320 H 560" stroke="#9d593e"/><text x="568" y="323" font-size="11" fill="#4d605b">Head flashing (geometry)</text>',
    '<text x="775" y="122" font-size="11" fill="#a75236" font-weight="700">LOFT SOURCE EVIDENCE</text>',
    '<text x="775" y="151" font-size="10" fill="#405b57">A4 nominal width: '+width+' mm</text>',
    '<text x="775" y="177" font-size="10" fill="#405b57">Frame head depth: '+sash.parameters.H+' mm</text>',
    '<text x="775" y="203" font-size="10" fill="#405b57">Thermal break: '+breakHead.parameters.H+' mm</text>',
    '<text x="775" y="229" font-size="10" fill="#405b57">Glazing thickness: '+glass.parameters.H+' mm</text>',
    '<text x="775" y="255" font-size="10" fill="#405b57">Flashing depth: '+flash.parameters.H+' mm</text>',
    '<text x="775" y="291" font-size="10" fill="#805b45">Water/air barrier continuity unvalidated</text>',
    '<text x="775" y="316" font-size="10" fill="#805b45">Structural loading unvalidated</text>',
    '<text x="775" y="341" font-size="10" fill="#805b45">Not a buildable certified junction</text>',
  ].join('');
  return svgBase('A4 · FACADE WINDOW HEAD / CONSTRUCTION STUDY',
    'Linked source solids: Terracotta / bronze frame / thermal break / glass / flashing',
    drawing);
}
export function deriveHotelArchitectureDocuments(
  manifest:HotelManifest,modules:ModuleSet,
):HotelArchitectureDocuments{
  if(manifest.rooms.length!==168||new Set(manifest.rooms.map(r=>r.id)).size!==168)
    throw new Error('HOTEL_DOCUMENTS_ROOM_IDENTITIES_INVALID');
  const width=modules.window.windowWidthMm;
  if([modules.standard,modules.accessible,modules.corner].some(s=>s.windowWidthMm!==width))
    throw new Error('HOTEL_DOCUMENTS_SOURCE_REVISIONS_DIVERGED');
  const glass=part(modules.window,'Glass');
  if(glass.parameters.W<=0||glass.parameters.D<=0||glass.parameters.H<=0)
    throw new Error('HOTEL_DOCUMENTS_INVALID_GLAZING_SOURCE');
  const elevationSvg=facadeElevation(manifest,width);
  const junctionSvg=junctionDrawing(modules.window,modules.standard);
  const types=[
    {key:'suite-standard',source:modules.standard},
    {key:'suite-accessible',source:modules.accessible},
    {key:'suite-corner',source:modules.corner},
  ];
  const scheduleRows:HotelScheduleRow[]=types.map(({key,source})=>{
    const count=manifest.rooms.filter(r=>r.moduleId.endsWith(key)).length;
    return {
      id:'sheet:hotel:window-schedule:'+key,
      description:source.displayName+' / A4 hosted glazing',
      quantity:count,nominalWidthMm:width,
      nominalHeightMm:glass.parameters.D,
      nominalGlazingAreaM2:count*glass.parameters.W*glass.parameters.D/1e6,
      sourceId:source.sourceProjectId,
    };
  });
  if(scheduleRows.reduce((n,row)=>n+row.quantity,0)!==168)
    throw new Error('HOTEL_DOCUMENTS_WINDOW_SCHEDULE_COUNT_INVALID');
  const scheduleHash=hashSourceBytes(JSON.stringify(scheduleRows));
  const elevationHash=hashSourceBytes(elevationSvg),
    junctionHash=hashSourceBytes(junctionSvg);
  const sourceIds=[
    modules.window.sourceProjectId,modules.standard.sourceProjectId,
    modules.accessible.sourceProjectId,modules.corner.sourceProjectId,
  ];
  const revision=Math.max(...[modules.window,modules.standard,
    modules.accessible,modules.corner].map(x=>x.revision));
  const registry:HotelDrawing[]=[
    {id:'sheet:hotel:A-201',name:'North façade / room-ID-linked elevation',
      viewType:'elevation',sourceIds,sourceHash:elevationHash,
      revision,issueStatus:'study-not-for-construction'},
    {id:'sheet:hotel:A-514',name:'Window head construction study',
      viewType:'detail',sourceIds,sourceHash:junctionHash,
      revision,issueStatus:'study-not-for-construction'},
    {id:'sheet:hotel:A-601',name:'168-key A4 window schedule',
      viewType:'schedule',sourceIds,sourceHash:scheduleHash,
      revision,issueStatus:'study-not-for-construction'},
  ];
  return {
    elevationSvg,elevationHash,junctionSvg,junctionHash,
    scheduleRows,scheduleHash,registry,issueStatus:'study-not-for-construction',
  };
}
