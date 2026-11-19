import type { Point3, WetPort, WetComponent, WetCoreModel, WetMedium, WetFitting, WetRun, StructuralMember, AssemblyKind } from './types.js';

function add(a: Point3, b: Point3): Point3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function same(a: Point3, b: Point3): boolean { return a.every((v, i) => v === b[i]); }

export function buildWetCore(options: { readonly basinShiftMm?: number } = {}): WetCoreModel {
  const basinShift = options.basinShiftMm ?? 0;
  if (!Number.isFinite(basinShift) || basinShift < -400 || basinShift > 400)
    throw new Error('Basin shift must be in range -400..400 mm');
  const components: WetComponent[] = [];
  const ports: WetPort[] = [];
  const runs: WetRun[] = [];
  const fittings: WetFitting[] = [];
  const structure: StructuralMember[] = [];
  const index = new Map<string, WetPort>();
  function component(id: string, kind: AssemblyKind, name: string,
    originMm: Point3, sizeMm: Point3, details: readonly {
      id: string; medium: WetMedium; role: WetPort['role']; diameter: number;
      at: Point3; connection: WetPort['connection'];
    }[], internalLinks: readonly (readonly [string,string])[] = []): void {
    const portIds = details.map((p) => id + ':' + p.id);
    components.push({ id, kind, name, manufacturer: 'generic-unverified',
      originMm, sizeMm, portIds, internalLinks: internalLinks.map(([a,b]) =>
        [id + ':' + a, id + ':' + b] as const) });
    for (const p of details) {
      const port: WetPort = { id: id + ':' + p.id, ownerId: id, medium: p.medium,
        role: p.role, nominalDiameterMm: p.diameter, positionMm: p.at,
        connection: p.connection };
      ports.push(port);
      index.set(port.id, port);
    }
  }
  const p = (id: string, medium: WetMedium, role: WetPort['role'],
    diameter: number, at: Point3, connection: WetPort['connection'] = 'press') =>
    ({ id, medium, role, diameter, at, connection });
  component('meter', 'water-meter', 'Domestic water meter',
    [200,200,0], [380,280,950], [
      p('out','cold-water','supply',20,[400,400,850]),
    ]);
  component('hpwh', 'water-heater', 'External heat-pump hot-water cylinder',
    [500,300,0], [650,650,1800], [
      p('in','cold-water','receive',20,[800,550,1040]),
      p('out','hot-water','supply',20,[800,550,1330]),
    ], [['in','out']]);
  const coldDests = ['heater','basin','shower','wc-upper','laundry','wc-lower'];
  component('cold-manifold', 'manifold','Cold water distribution',
    [1850,1450,1020],[450,240,320],[
      p('in','cold-water','receive',20,[1900,1500,1210]),
      ...coldDests.map((id,i) => p(id,'cold-water','supply',20,[2010,1510 + i*30,1210])),
    ], coldDests.map((id) => ['in',id] as const));
  const hotDests = ['basin','shower','laundry'];
  component('hot-manifold', 'manifold','Hot water distribution',
    [1820,1770,1160],[460,240,320],[
      p('in','hot-water','receive',20,[1900,1820,1330]),
      ...hotDests.map((id,i) => p(id,'hot-water','supply',20,[2010,1820 + i*35,1330])),
    ], hotDests.map((id) => ['in',id] as const));
  const shift = (at: Point3): Point3 => add(at, [basinShift,0,0]);
  component('bath-basin','basin','Wall-hung basin, mixer and bottle trap',
    shift([3200,420,3000]),[590,480,520],[
      p('cold','cold-water','receive',20,shift([3500,700,3640])),
      p('hot','hot-water','receive',20,shift([3580,700,3640])),
      p('waste','sanitary','discharge',40,shift([3550,710,3520]),'solvent'),
    ]);
  component('bath-shower','shower','Shower tray, waste, valve and rail',
    [440,2290,3000],[900,980,2100],[
      p('cold','cold-water','receive',20,[800,2800,4030]),
      p('hot','hot-water','receive',20,[900,2800,4030]),
      p('waste','sanitary','discharge',50,[850,2780,3160],'solvent'),
    ]);
  component('bath-wc','wc','Close-coupled WC with integrated trap',
    [3360,2440,3000],[620,700,820],[
      p('cold','cold-water','receive',20,[3680,2780,3420]),
      p('waste','sanitary','discharge',100,[3700,2780,3140],'solvent'),
    ]);
  component('ground-laundry','laundry-trough','Laundry trough and wall mixer',
    [3200,440,0],[620,520,970],[
      p('cold','cold-water','receive',20,[3470,700,950]),
      p('hot','hot-water','receive',20,[3550,700,950]),
      p('waste','sanitary','discharge',40,[3500,700,730],'solvent'),
    ]);
  component('ground-wc','wc','Powder-room close-coupled WC',
    [3380,2440,0],[620,700,820],[
      p('cold','cold-water','receive',20,[3650,2780,820]),
      p('waste','sanitary','discharge',100,[3700,2780,560],'solvent'),
    ]);
  const trapSpecs = [
    ['basin-trap',shift([3500,700,3370]),40],
    ['shower-trap',[870,2780,2980],50],
    ['laundry-trap',[3500,700,550],40],
  ] as const;
  for (const [id,at,diameter] of trapSpecs) {
    component(id,'trap',id.replace('-',' ')+' (water seal)',at,
      [180,160,180],[
        p('in','sanitary','receive',diameter,[at[0],at[1],at[2]+100],'solvent'),
        p('out','sanitary','discharge',diameter,[at[0]-90,at[1],at[2]-20],'solvent'),
      ],[['in','out']]);
    fittings.push({id:'fitting:'+id,runId:id,kind:'trap',positionMm:at,
      nominalDiameterMm:diameter,catalogStatus:'generic'});
  }
  const wastePorts = [
    p('basin','sanitary','receive',40,[2280,1700,2800],'solvent'),
    p('shower','sanitary','receive',50,[2260,1700,2770],'solvent'),
    p('wc-upper','sanitary','receive',100,[2300,1700,2740],'solvent'),
    p('laundry','sanitary','receive',40,[2280,1700,200],'solvent'),
    p('wc-lower','sanitary','receive',100,[2300,1700,150],'solvent'),
  ];
  component('stack','sanitary-stack','Sanitary stack, branch wyes and vent extension',
    [2220,1600,-300],[200,220,6200],[
      ...wastePorts,
      p('out','sanitary','discharge',100,[2300,1700,-280],'solvent'),
      p('vent','vent','discharge',100,[2300,1700,6000],'solvent'),
    ], wastePorts.map((wp) => [wp.id,'out'] as const));
  for (const wp of wastePorts) fittings.push({
    id:'fitting:stack:'+wp.id,runId:'stack:'+wp.id,kind:'wye-branch',
    positionMm:wp.at,nominalDiameterMm:wp.diameter,catalogStatus:'requires-product-matching',
  });
  const get = (id: string): Point3 => {
    const port = index.get(id);
    if (!port) throw new Error('Missing port '+id);
    return port.positionMm;
  };
  function run(id: string, medium: WetMedium, from: string, to: string,
    intermediate: readonly Point3[] = []): void {
    const start = get(from), end = get(to);
    const points = [start,...intermediate,end].filter((point,i,all) => i===0 || !same(point,all[i-1]!));
    const fittingIds: string[] = [];
    for(let i=1;i<points.length-1;i++){
      const before=points[i-1]!,at=points[i]!,after=points[i+1]!;
      const v0=at.map((c,k)=>c-before[k]!) as number[];
      const v1=after.map((c,k)=>c-at[k]!) as number[];
      const dot=v0.reduce((s,c,k)=>s+c*v1[k]!,0);
      const zero=v0.reduce((s,c)=>s+c*c,0)*v1.reduce((s,c)=>s+c*c,0);
      if(zero===0 || Math.abs(dot/Math.sqrt(zero)-1)<1e-6)continue;
      const fittingId='fitting:'+id+':'+i;
      const kind=medium==='sanitary'?'dwv-bend-unverified':'press-elbow-90';
      fittings.push({id:fittingId,runId:id,kind,positionMm:at,
        nominalDiameterMm:index.get(from)!.nominalDiameterMm,
        catalogStatus:kind==='press-elbow-90'?'generic':'requires-product-matching'});
      fittingIds.push(fittingId);
    }
    runs.push({id,medium,fromPortId:from,toPortId:to,
      nominalDiameterMm:index.get(from)!.nominalDiameterMm,
      material:medium==='sanitary'||medium==='vent'?'pvc-dwv':'copper-press',
      pointsMm:points,fittingIds});
  }
  function waterRoute(id:string,medium:'cold-water'|'hot-water',from:string,to:string,upper:boolean):void {
    const a=get(from), b=get(to);
    // The service-chase vertical leg is deliberately kept clear of the floor-joist field.
    const intermediate:Point3[]=upper
      ? [[2150,a[1],a[2]],[2150,1640,a[2]],[2150,1640,b[2]],[b[0],1640,b[2]]]
      : [[b[0],a[1],a[2]],[b[0],b[1],a[2]]];
    run(id,medium,from,to,intermediate);
  }
  run('cold-trunk','cold-water','meter:out','cold-manifold:in',
    [[400,1500,850],[1900,1500,850]]);
  run('heater-feed','cold-water','cold-manifold:heater','hpwh:in',
    [[1000,1510,1210],[1000,550,1210],[800,550,1210]]);
  run('hot-trunk','hot-water','hpwh:out','hot-manifold:in',
    [[800,1820,1330]]);
  const consumers=[
    ['basin','bath-basin',true],['shower','bath-shower',true],
    ['wc-upper','bath-wc',true],['laundry','ground-laundry',false],
    ['wc-lower','ground-wc',false],
  ] as const;
  for(const [channel,fixture,upper] of consumers) {
    waterRoute('cold-'+channel,'cold-water','cold-manifold:'+channel,fixture+':cold',upper);
    if(hotDests.includes(channel))waterRoute('hot-'+channel,'hot-water','hot-manifold:'+channel,fixture+':hot',upper);
  }
  // Discharges are separate directed sanitary networks, not reverse water-supply pipes.
  run('basin-to-trap','sanitary','bath-basin:waste','basin-trap:in');
  run('shower-to-trap','sanitary','bath-shower:waste','shower-trap:in');
  run('laundry-to-trap','sanitary','ground-laundry:waste','laundry-trap:in');
  run('basin-branch','sanitary','basin-trap:out','stack:basin',
    [shift([3400,700,3260]),[3400,1620,3050]]);
  run('shower-branch','sanitary','shower-trap:out','stack:shower',
    [[1050,2780,2930],[1050,1700,2830]]);
  run('wc-upper-branch','sanitary','bath-wc:waste','stack:wc-upper',
    [[3550,2780,3120],[3550,1700,2960]]);
  run('laundry-branch','sanitary','laundry-trap:out','stack:laundry',
    [[3300,700,450],[3300,1700,330]]);
  run('wc-lower-branch','sanitary','ground-wc:waste','stack:wc-lower',
    [[3500,2780,500],[3500,1700,280]]);
  function element(id:string,kind:StructuralMember['kind'],a:Point3,b:Point3,structural:boolean):void {
    structure.push({id,kind,minMm:a,maxMm:b,structural});
  }
  element('ground:slab','slab',[0,0,-150],[4800,3600,0],true);
  element('ground:tile-finish','tile-finish',[0,0,0],[4800,3600,18],false);
  element('upper:subfloor','subfloor',[0,0,2980],[4800,3600,3000],false);
  element('upper:tile-finish','tile-finish',[0,0,3000],[4800,3600,3018],false);
  for(const storey of [0,3000]){
    element('rear:bottom-plate:'+storey,'plate',[0,3500,storey],[4800,3580,storey+45],true);
    element('rear:top-plate:'+storey,'plate',[0,3500,storey+2580],[4800,3580,storey+2625],true);
    for(const x of [0,450,900,1350,1800,2250,2700,3150,3600,4050,4500])
      element('rear:stud:'+storey+':'+x,'stud',[x,3500,storey+45],[x+45,3580,storey+2580],true);
    element('rear:lining:'+storey,'lining',[0,3580,storey],[4800,3593,storey+2625],false);
  }
  for(const x of [360,810,1260,1710,2610,3060,3510,3960,4410])
    element('floor:joist:'+x,'joist',[x,150,2760],[x+45,3450,2985],true);
  for(const storey of [0,3000]){
    element('wall:sole:'+storey,'plate',[2250,160,storey],[2390,3440,storey+45],true);
    element('wall:top:'+storey,'plate',[2250,160,storey+2580],[2390,3440,storey+2625],true);
    for(const y of [160,610,1060,1510,1960,2410,2860,3310])
      if(y!==1510&&y!==1960)
        element('wall:stud:'+storey+':'+y,'stud',[2250,y,storey+45],[2390,y+45,storey+2580],true);
  }
  element('wall:service-chase','chase-boundary',[2040,1450,200],[2460,1970,5600],false);
  element('wall:lining','lining',[2400,150,0],[2413,3450,5600],false);
  return {
    id:'TH-01-WET-CORE',revision:'v0.3',dimensionsMm:[4800,3600,6000],
    parameters:{basinShiftMm:basinShift,storeyHeightMm:3000},
    components,ports,runs,fittings,structure,committed:false,
    assumptions:[
      'Parametric component families and connections are generic: product geometries, fittings and installation instructions are not manufacturer verified.',
      'Drainage grade target 1:60 is an illustrative design assumption, not a determination of NCC/AS/NZS compliance.',
      'Structural joist penetrations are not approved automatically; any intersection is an unresolved engineering-review issue.',
      'No pipe flow sizing, hydraulic pressure, fixture loading, sanitary ventilation performance, waterproofing or statutory compliance has been demonstrated.',
      'The model is an uncommitted candidate with stable semantic IDs; interface and geometry representations are derived.',
    ],
  };
}
