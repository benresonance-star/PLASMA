import {
  buildWetCore,assessWetCore,traceConnectedPorts,compareWetCoreChange,
  type WetCoreModel,type WetIssue,
} from '@spds/wet-core';
import {WetCoreViewport,type ViewMode,type LevelMode,type Layers} from './scene.js';
import './style.css';
const $=<T extends HTMLElement>(selector:string):T=>{
  const el=document.querySelector<T>(selector);
  if(!el)throw new Error('Missing element '+selector);
  return el;
};
function el<K extends keyof HTMLElementTagNameMap>(
  tag:K,cls:string,content?:string,
):HTMLElementTagNameMap[K]{
  const obj=document.createElement(tag);obj.className=cls;
  if(content!==undefined)obj.textContent=content;
  return obj;
}
const baseline=buildWetCore();
let model:WetCoreModel=baseline,level:LevelMode='both',view:ViewMode='3d';
let shifted=false,selected:string|null='bath-basin';
let layers:Layers={cold:true,hot:true,waste:true,frame:true,ports:false};
const viewport=new WetCoreViewport($('#viewport'),id=>{selected=id;update();});
const n=(value:number):string=>value.toLocaleString(undefined,{maximumFractionDigits:1});
function describeSelection():void{
  const title=$('#selection-name'),area=$('#selection-detail');
  area.replaceChildren();
  const item=model.components.find(c=>c.id===selected);
  const port=model.ports.find(p=>p.id===selected);
  const run=model.runs.find(r=>r.id===selected);
  const fitting=model.fittings.find(f=>f.id===selected);
  const structure=model.structure.find(s=>s.id===selected);
  if(item){
    title.textContent=item.name;
    area.append(el('div','meta','Semantic ID: '+item.id));
    area.append(el('div','meta','Assembly type: '+item.kind));
    area.append(el('div','meta','Generic parametric family (manufacturer not validated)'));
    const ports=el('div','port-list');
    for(const id of item.portIds){
      const pt=model.ports.find(p=>p.id===id);
      if(!pt)continue;
      const b=el('button','tag',pt.medium+' · '+pt.nominalDiameterMm+' mm · '+pt.role);
      b.title=id;
      b.addEventListener('click',()=>{selected=id;update();});
      ports.append(b);
    }
    area.append(ports);
    area.append(el('div','meta','Reachable downstream ports: '+
      traceConnectedPorts(model,item.portIds[0]??item.id).length));
  }else if(port){
    title.textContent=port.id;
    area.append(el('div','meta','Type: '+port.medium+' / '+port.role));
    area.append(el('div','meta','Connection: '+port.connection+' / DN '+port.nominalDiameterMm));
    area.append(el('div','meta','Location XYZ: '+port.positionMm.join(', ')+' mm'));
  }else if(run){
    title.textContent=run.id;
    let length=0;
    for(let i=1;i<run.pointsMm.length;i++){
      const a=run.pointsMm[i-1]!,b=run.pointsMm[i]!;
      length+=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    }
    area.append(el('div','meta','System: '+run.medium));
    area.append(el('div','meta',run.material+' · nominal '+run.nominalDiameterMm+' mm'));
    area.append(el('div','meta',run.fromPortId+' → '+run.toPortId));
    area.append(el('div','meta',n(length/1000)+' m · '+run.fittingIds.length+' fitting references'));
  }else if(fitting){
    title.textContent=fitting.id;
    area.append(el('div','meta',fitting.kind+' / DN '+fitting.nominalDiameterMm));
    area.append(el('div','meta','Product status: '+fitting.catalogStatus));
  }else if(structure){
    title.textContent=structure.id;
    area.append(el('div','meta',structure.kind+(structure.structural?' · structural':' · non-structural')));
    area.append(el('div','meta','Min: '+structure.minMm.join(', ')+' mm'));
    area.append(el('div','meta','Max: '+structure.maxMm.join(', ')+' mm'));
  }else{
    title.textContent=selected??'Selected element';
    area.append(el('div','meta','Select a physical assembly or service run in the viewport.'));
  }
  if(selected){
    const checks=assessWetCore(model).issues.filter(i=>i.ownerId===selected||i.relatedIds.includes(selected!));
    if(checks.length)area.append(el('div','meta',checks.length+' related unresolved engineering check(s)'));
  }
}
function showSystems():void{
  const root=$('#systems');root.replaceChildren();
  const types=[
    ['cold-water','Cold-water network','cold'],
    ['hot-water','Hot-water network','hot'],
    ['sanitary','Sanitary & traps','waste'],
  ] as const;
  for(const [type,title,colour] of types){
    const arr=model.runs.filter(r=>r.medium===type);
    const button=el('button','sys');
    button.append(el('i','key '+colour),el('strong','',title),el('small','',arr.length+' runs'));
    button.addEventListener('click',()=>{selected=arr[0]?.id??null;update();});
    root.append(button);
  }
}
function showIssues():void{
  const all=assessWetCore(model).issues, unique=new Map<string,WetIssue>();
  for(const issue of all){
    const key=issue.ownerId+'|'+issue.code+'|'+issue.relatedIds.join(',');
    if(!unique.has(key))unique.set(key,issue);
  }
  const ordered=[...unique.values()].sort((a,b)=>(a.severity==='error'?0:1)-(b.severity==='error'?0:1));
  $('#issue-count').textContent='('+ordered.length+')';
  const root=$('#issues');root.replaceChildren();
  for(const issue of ordered.slice(0,8)){
    const item=el('article','issue'+(issue.severity==='error'?' error':''));
    item.append(el('strong','',issue.code.replaceAll('_',' ')));
    item.append(el('p','',issue.ownerId+': '+issue.detail));
    item.tabIndex=0;item.setAttribute('role','button');
    const activate=()=>{selected=issue.ownerId;update();};
    item.addEventListener('click',activate);
    item.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}
    });
    root.append(item);
  }
  if(ordered.length>8)root.append(el('p','',String(ordered.length-8)+' more unresolved issues. Model-level results are retained.'));
}
function showQuantities():void{
  const a=assessWetCore(model);
  $('#quantities').textContent='Copper (nominal centreline): '+
    n(a.materialLengthMm['copper-press']/1000)+' m; PVC-DWV: '+
    n(a.materialLengthMm['pvc-dwv']/1000)+' m. '+model.components.length+
    ' component assemblies; '+model.fittings.length+' identified fittings.';
  $('#assumptions').replaceChildren(...model.assumptions.map(msg=>el('li','',msg)));
}
function update():void{
  viewport.show(model,layers,level,selected);
  const a=assessWetCore(model);
  $('#connected').textContent=a.connectedFixtureCount+'/5';
  $('#route-count').textContent=String(a.checkedRunCount);
  $('#fitting-count').textContent=String(a.fittingCount);
  const changes=compareWetCoreChange(baseline,model);
  $('#change-note').textContent=shifted
    ? 'PROPOSED ONLY: '+changes.modifiedComponentIds.length+' assembly/assemblies and '+
       changes.modifiedRunIds.length+' dependent route(s) updated; '+
       changes.unchangedRunIds.length+' unrelated routes unchanged. No commit.'
    : 'Baseline design candidate · not approved or committed.';
  const shift=$<HTMLButtonElement>('#shift');
  shift.textContent=shifted?'Restore basin position':'Move basin +400';
  shift.classList.toggle('selected',shifted);
  describeSelection();showSystems();showIssues();showQuantities();
}
function orient(next:ViewMode):void{
  view=next;
  if(view==='plan'&&level==='both')level='upper';
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))
    button.classList.toggle('selected',button.dataset.view===view);
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-level]'))
    button.classList.toggle('selected',button.dataset.level===level);
  $('#view-label').textContent=view==='3d'?'ASSEMBLY / ISOMETRIC':
    view==='plan'?'ORTHOGRAPHIC / PLAN':'ORTHOGRAPHIC / SECTION';
  $('#level-label').textContent=level==='both'?'Upper bathroom + ground laundry':
    level==='upper'?'Upper bathroom':'Ground laundry & powder room';
  viewport.fit(view);update();
}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))
  button.addEventListener('click',()=>orient(button.dataset.view as ViewMode));
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-level]'))
  button.addEventListener('click',()=>{
    level=button.dataset.level as LevelMode;
    orient(view);
  });
for(const name of ['cold','hot','waste','frame','ports'] as const){
  $<HTMLInputElement>('#'+name).addEventListener('change',e=>{
    const checked=(e.currentTarget as HTMLInputElement).checked;
    layers={...layers,[name]:checked};update();
  });
}
$('#shift').addEventListener('click',()=>{
  shifted=!shifted;model=buildWetCore({basinShiftMm:shifted?400:0});
  selected='bath-basin';update();
});
$('#reset').addEventListener('click',()=>{
  model=baseline;shifted=false;selected='bath-basin';level='both';orient('3d');
});
$('#fit').addEventListener('click',()=>viewport.fit(view));
orient('3d');
