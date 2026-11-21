import {
  BoxGeometry,CylinderGeometry,Group,IcosahedronGeometry,
  Mesh,MeshStandardMaterial,PlaneGeometry,DoubleSide,
} from 'three';

/** F21.1: clearly synthetic viewer-only urban study environment.
 * These unregistered context objects are deliberately outside the
 * authoritative source-model root, never returned as B-rep evidence,
 * excluded from extents fit and not semantically pickable as building parts.
 * Replace with actual georegistered captures at the Reality Layer boundary.
 */
export function createSyntheticHotelSurroundings():Group{
  const root=new Group();
  root.name='synthetic-urban-context-display-only';
  root.userData={sourceKind:'synthetic-illustration',surveyCertified:false};
  const mats={
    pavement:new MeshStandardMaterial({color:0xaaa99b,roughness:.95}),
    site:new MeshStandardMaterial({color:0xb9b5a8,roughness:1}),
    road:new MeshStandardMaterial({color:0x646b69,roughness:1}),
    line:new MeshStandardMaterial({color:0xd9cdb5,roughness:.9}),
    neighbors:[
      new MeshStandardMaterial({color:0x777f7b,roughness:.9}),
      new MeshStandardMaterial({color:0x90918a,roughness:.85}),
      new MeshStandardMaterial({color:0xa6a79c,roughness:.86}),
      new MeshStandardMaterial({color:0x928978,roughness:.9}),
    ],
    trees:[
      new MeshStandardMaterial({color:0x526d50,roughness:1}),
      new MeshStandardMaterial({color:0x63825c,roughness:1}),
      new MeshStandardMaterial({color:0x728b64,roughness:1}),
    ],
    trunk:new MeshStandardMaterial({color:0x6d6550,roughness:1}),
  };
  function rect(name:string,x:number,y:number,z:number,w:number,h:number,d:number,
    material:MeshStandardMaterial){
    const mesh=new Mesh(new BoxGeometry(w,h,d),material);
    mesh.name=name;
    mesh.position.set(x,y,z);
    mesh.userData={sourceKind:'synthetic-context-not-surveyed'};
    root.add(mesh);
  }
  rect('SITE / hypothetical public realm',0,-510,0,85000,180,70000,mats.site);
  rect('STREET / east-west',0,-530,43000,165000,130,17000,mats.road);
  rect('STREET / west edge',-53500,-530,3000,15000,130,130000,mats.road);
  rect('STREET / north edge',0,-530,-39000,165000,130,14000,mats.road);
  rect('PAVEMENT / north',0,-415,33500,145000,140,2500,mats.pavement);
  rect('PAVEMENT / west',-43500,-415,0,3500,140,82000,mats.pavement);
  rect('PAVEMENT / south',0,-415,-31000,145000,140,2300,mats.pavement);
  for(let i=-4;i<=4;i++){
    rect('STREET MARKING / dashed centreline',i*14500,-450,43000,
      6100,8,120,mats.line);
  }
  const blocks=[
    [-76000,-23000,20500,19500,46000,0],
    [-76000,29000,13000,17500,26000,1],
    [80500,-24000,17500,24000,39000,2],
    [84000,21000,25000,28000,28000,3],
    [33000,-67000,14500,33000,27000,1],
    [-27000,-67500,20000,24000,32000,2],
    [28500,68000,18000,36000,28000,0],
    [-22000,70000,12000,32000,19000,3],
  ] as const;
  for(const [x,z,height,width,depth,materialIndex] of blocks){
    rect('CONTEXT / schematic neighbouring mass',x,height/2-390,z,
      width,height,depth,mats.neighbors[materialIndex]!);
  }
  // Repeated low-poly avenue trees provide scale without falsely
  // representing surveyed trees or street positions.
  const foliageGeometry=new IcosahedronGeometry(1900,1);
  const trunkGeometry=new CylinderGeometry(125,175,2700,6);
  const offsets=[
    [-40000,30000],[-26000,30000],[-12000,30000],[4000,30000],
    [17000,30000],[31000,30000],[42000,30000],
    [-39500,-27000],[-25500,-27000],[-10500,-27000],
    [9500,-27000],[27000,-27000],[41000,-27000],
  ] as const;
  offsets.forEach(([x,z],i)=>{
    const trunk=new Mesh(trunkGeometry,mats.trunk);
    trunk.name='STREET TREE / synthetic trunk';
    trunk.position.set(x,950,z);
    trunk.userData={sourceKind:'synthetic-context-not-surveyed'};
    root.add(trunk);
    const canopy=new Mesh(foliageGeometry,mats.trees[i%3]!);
    canopy.name='STREET TREE / synthetic foliage';
    canopy.position.set(x,3700,z);
    canopy.scale.set(1.05,1.2,.9);
    canopy.userData={sourceKind:'synthetic-context-not-surveyed'};
    root.add(canopy);
  });
  const siteShadow=new Mesh(
    new PlaneGeometry(74000,61000),
    new MeshStandardMaterial({color:0x808b7c,roughness:1,side:DoubleSide}),
  );
  siteShadow.rotation.x=-Math.PI/2;
  siteShadow.position.set(0,-395,0);
  siteShadow.userData={sourceKind:'synthetic-context-not-surveyed'};
  siteShadow.name='SITE / graphic base under model';
  root.add(siteShadow);
  return root;
}
