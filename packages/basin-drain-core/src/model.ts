import {AU_WATERMARK_COMPONENT_SELECTION} from './australian-catalogue.js';
import type {Point3,Vector3,Component,Port,Joint,Member,BasinModel,Scenario} from './types.js';
const point=(x:number,y:number,z:number):Point3=>[x,y,z];
function dir(a:Point3,b:Point3):Vector3 {
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const d=Math.hypot(dx,dy,dz);
  if(d<.001)throw Error('Zero-length pipe geometry');
  return [dx/d,dy/d,dz/d];
}
const opposite=(v:Vector3):Vector3=>[-v[0],-v[1],-v[2]];
export function createBasinModel(options:Scenario={}):BasinModel {
  const denominator=options.gradeDenominator??50;
  const diameter=options.internalDiameterMm??38;
  const Q=options.dischargeLps??0.12;
  if(!Number.isFinite(denominator)||denominator<25||denominator>1000)throw Error('Grade denominator 25–1000 required');
  if(!Number.isFinite(diameter)||diameter<18||diameter>60)throw Error('Internal diameter 18–60 mm required');
  if(!Number.isFinite(Q)||Q<0||Q>1.5)throw Error('Flow demand 0–1.5 L/s required');
  const grade=1/denominator;
  const gradedStart=point(930,1110,2880);
  const gradedEnd=point(2560,1110,2880-1630*grade);
  const wyeJunction=point(2660,1110,gradedEnd[2]-100);
  const components:Component[]=[],ports:Port[]=[],joints:Joint[]=[];
  function add(id:string,family:Component['family'],name:string,path:Point3[],
    notes:string[]=[], special?:{inputPorts:Port[];outputPorts:Port[];links:(readonly [string,string])[]}):void {
    const normalIn=opposite(dir(path[0]!,path[1]!));
    const normalOut=dir(path[path.length-2]!,path[path.length-1]!);
    const ownPorts:Port[]=special?[...special.inputPorts,...special.outputPorts]:[
      {id:id+':in',ownerId:id,at:path[0]!,normal:normalIn,dn:family==='soil-stack'?100:40,role:'in'},
      {id:id+':out',ownerId:id,at:path[path.length-1]!,normal:normalOut,dn:family==='soil-stack'?100:40,role:'out'},
    ];
    ports.push(...ownPorts);
    components.push({id,family,name,path,portIds:ownPorts.map(p=>p.id),
      internalLinks:special?.links??[[id+':in',id+':out']],
      diameterMm:family==='soil-stack'?96:diameter,productStatus:'generic-unverified',
      australianProductCandidateId:AU_WATERMARK_COMPONENT_SELECTION[id]??null,
      installationNotes:notes});
  }
  const basinOutlet=point(850,830,3450);
  const trapOutlet=point(850,850,3320);
  const adapterOut=point(850,895,3320);
  const bendTopIn=point(850,1030,3320);
  const bendTopOut=point(850,1110,3240);
  const bendBottomIn=point(850,1110,2960);
  add('basin','basin','Wall-mounted basin and tailpiece',
    [point(850,830,3510),basinOutlet],
    ['Rim at approximately 850 mm above upper FFL. Actual waste port and fixing pattern need manufacturer family.']);
  add('trap','p-trap','DN40 trap / retained water seal',[
    basinOutlet,point(850,830,3330),point(850,830,3275),point(850,795,3275),
    point(850,795,3320),trapOutlet],
    ['Seal depth, trap arm and performance not verified by steady flow model.']);
  add('adapter','trap-adapter','Compression-to-solvent adapter DN40',[trapOutlet,adapterOut],
    ['Trap connection and material compatibility require product selection.']);
  add('pipe-wall','straight-pipe','DN40 service-wall transit',[adapterOut,bendTopIn],
    ['Passes through a non-structural lining opening between studs; required sealing remains unresolved.']);
  add('bend-top','long-sweep-90','Swept 90° horizontal-to-dropper bend',[
    bendTopIn,point(850,1055,3320),point(850,1085,3302),
    point(850,1110,3270),bendTopOut],
    ['Nominal swept geometry and radius: must match an actual DWV 90° fitting.']);
  add('dropper','straight-pipe','Vertical dropper through upper framed floor',
    [bendTopOut,bendBottomIn],
    ['100 mm nominal sleeve through sheet floor; no joist penetration permitted.']);
  add('bend-bottom','long-sweep-90','Swept 90° dropper-to-branch bend',[
    bendBottomIn,point(850,1110,2935),point(862,1110,2906),
    point(888,1110,2885),point(908,1110,2880),gradedStart],
    ['Manufacturer fitting must provide compatible inlet/outlet spigots and radius.']);
  add('grade-branch','graded-branch','Graded underfloor DN40 sanitary branch',
    [gradedStart,gradedEnd],
    ['Illustrative invert grade 1:'+String(denominator)+'. Must remain between joists with supported spans.']);
  const wyeInputs:Port[]=[
    {id:'wye:branch-in',ownerId:'wye',at:gradedEnd,
      normal:opposite(dir(gradedStart,gradedEnd)),dn:40,role:'in'},
    {id:'wye:soil-in',ownerId:'wye',at:point(2660,1110,2940),
      normal:[0,0,1],dn:100,role:'in'},
  ];
  const wyeOutputs:Port[]=[
    {id:'wye:stack-out',ownerId:'wye',at:point(2660,1110,2580),
      normal:[0,0,-1],dn:100,role:'out'},
  ];
  add('wye','45-wye','DN40 45° branch into DN100 sanitary stack',
    [gradedEnd,wyeJunction,point(2660,1110,2580)],
    ['Nominal 45° branch; manufacturer socket geometry, accessible connection and stack capacity unresolved.'],
    {inputPorts:wyeInputs,outputPorts:wyeOutputs,
      links:[['wye:branch-in','wye:stack-out'],['wye:soil-in','wye:stack-out']]});
  add('stack','soil-stack','DN100 stack segment and continuation to downstream',
    [point(2660,1110,2580),point(2660,1110,1780)],
    ['Downstream invert and vent design are not modelled or verified.']);
  add('cleanout','cleanout','Accessible stack inspection / cleanout fitting',
    [point(2660,1110,2440),point(2740,1110,2440)],
    ['Access dimensions and correct junction/detail must be matched to the stack.']);
  const chain:[string,string,Joint['method']][]=[
    ['basin:out','trap:in','slip-joint'],
    ['trap:out','adapter:in','compression-adapter'],
    ['adapter:out','pipe-wall:in','solvent-socket'],
    ['pipe-wall:out','bend-top:in','solvent-socket'],
    ['bend-top:out','dropper:in','solvent-socket'],
    ['dropper:out','bend-bottom:in','solvent-socket'],
    ['bend-bottom:out','grade-branch:in','solvent-socket'],
    ['grade-branch:out','wye:branch-in','solvent-socket'],
    ['wye:stack-out','stack:in','stack-socket'],
  ];
  chain.forEach(([from,to,method],index)=>joints.push({
    id:'joint:'+index,from,to,method,
    socketDepthAssumedMm:method==='solvent-socket'?24:16,
    productStatus:'generic-unverified',
  }));
  if(options.disconnectedJoint){
    const i=ports.findIndex(p=>p.id==='grade-branch:in');
    ports[i]={...ports[i]!,at:point(942,1110,2880)};
  }
  const framing:Member[]=[];
  const box=(id:string,kind:Member['kind'],a:Point3,b:Point3,structural:boolean)=>
    framing.push({id,kind,min:a,max:b,structural});
  box('floor:sheathing','floor-sheet',point(0,0,2975),point(3600,2800,3000),false);
  box('floor:finish','floor-finish',point(0,0,3000),point(3600,2800,3020),false);
  box('floor:ceiling','ceiling',point(0,0,2695),point(3600,2800,2710),false);
  for(const y of [470,700,1400,1930,2480])
    box('floor:joist:'+y,'joist',point(0,y,2720),point(3600,y+45,2975),true);
  if(options.joistConflict)
    box('floor:joist:test-collision','joist',point(1280,1080,2720),point(1450,1150,2975),true);
  for(const x of [100,550,1150,1600,2050,2500,2950,3400])
    box('wall:stud:'+x,'stud',point(x,930,3020),point(x+45,1030,5200),true);
  box('wall:sole-plate','plate',point(0,930,3020),point(3600,1030,3065),true);
  box('wall:top-plate','plate',point(0,930,5155),point(3600,1030,5200),true);
  box('wall:inner-lining','lining',point(0,913,3020),point(3600,930,5200),false);
  box('wall:outer-lining','lining',point(0,1030,3020),point(3600,1043,5200),false);
  const penetrations=[
    {id:'opening:wall',hostIds:['wall:inner-lining','wall:outer-lining'],
      at:point(850,980,3320),axis:'Y' as const,boreDiameterMm:100,sleeveODMm:88,
      status:'detail-required' as const,
      notes:['Cut both lining leaves, keep structural stud intact.', 'Air, moisture, acoustic and fire continuity must be detailed.']},
    {id:'opening:floor',hostIds:['floor:sheathing','floor:finish'],
      at:point(850,1110,2990),axis:'Z' as const,boreDiameterMm:115,sleeveODMm:100,
      status:'detail-required' as const,
      notes:['Sheathing and finish aperture centred within joist bay.', 'Sleeve, movement gap and waterproofing continuity require design.']},
  ];
  const supports=[
    {id:'bracket:1',at:point(1300,1110,2872.6),maxAssumedSpanMm:800,status:'supplier-unverified' as const},
    {id:'bracket:2',at:point(1960,1110,2859.4),maxAssumedSpanMm:800,status:'supplier-unverified' as const},
    {id:'bracket:3',at:point(2420,1110,2850.2),maxAssumedSpanMm:800,status:'supplier-unverified' as const},
  ];
  const lookup=new Map(components.map(c=>[c.id,c]));
  const route:Point3[]=[];
  for(const id of ['basin','trap','adapter','pipe-wall','bend-top','dropper','bend-bottom','grade-branch','wye','stack']){
    for(const p of lookup.get(id)!.path){
      if(route.length===0||route[route.length-1]!.some((val,k)=>Math.abs(p[k]!-val)>.00001))route.push(p);
    }
  }
  return {schema:'basin-stack-benchmark/v0.4',id:'TH01-BASIN-STACK',
    components,ports,joints,framing,penetrations,supports,route,gradedStart,gradedEnd,
    input:{grade,dischargeLps:Q,diameterMm:diameter,n:.011,gradeBenchmarkMin:1/80},
    committed:false};
}
