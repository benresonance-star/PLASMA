import {createBasinModel,solveBasinDrain,type BasinModel,type FlowSolution} from '@spds/basin-drain-core';
import {DrainViewport,type Layers} from './scene.js';
import './style.css';

const $=<T extends HTMLElement>(id:string):T=>{
  const element=document.getElementById(id) as T|null;
  if(!element)throw Error('Missing view control '+id);
  return element;
};
const newElement=<K extends keyof HTMLElementTagNameMap>(name:K,cls:string,text?:string):HTMLElementTagNameMap[K]=>{
  const e=document.createElement(name);e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
};
const number=(n:number|null,digits=2):string=>n===null?'—':n.toFixed(digits);
const layers:Layers={frame:true,joints:true,water:true};
let model:BasinModel=createBasinModel(),solution:FlowSolution=solveBasinDrain(model);
let selected='grade-branch',playing=true,view:'3d'|'section'='3d';
let viewport:DrainViewport|null=null;
try{
  viewport=new DrainViewport($('render3d'),id=>{selected=id;updateDetails();highlightParts();});
}catch(error){
  console.error('WebGL unavailable; engineering section remains available',error);
  view='section';
  $('mode3d').setAttribute('disabled','true');
  $('resultExplanation').textContent='3D graphics unavailable. Long section and solver checks remain functional.';
}
function scenario(){
  return {
    gradeDenominator:Number($<HTMLSelectElement>('grade').value),
    internalDiameterMm:Number($<HTMLSelectElement>('diameter').value),
    dischargeLps:Number($<HTMLInputElement>('demand').value),
    joistConflict:$<HTMLInputElement>('joistFault').checked,
    disconnectedJoint:$<HTMLInputElement>('jointFault').checked,
  };
}
function selectedEntity(){
  const component=model.components.find(c=>c.id===selected);
  const joint=model.joints.find(j=>j.id===selected);
  const opening=model.penetrations.find(p=>p.id===selected);
  const support=model.supports.find(p=>p.id===selected);
  const frame=model.framing.find(p=>p.id===selected);
  return {component,joint,opening,support,frame};
}
function updateDetails():void {
  const root=$('selectedDetail');root.replaceChildren();
  const {component,joint,opening,support,frame}=selectedEntity();
  const name=component?.name??joint?.id??opening?.id??support?.id??frame?.id??selected;
  $('selectedTitle').textContent=name;
  const row=(label:string,value:string)=>{
    const box=newElement('div','',label+': '+value);root.append(box);
  };
  root.className='selected-spec';
  row('ID',selected);
  if(component){
    row('Family',component.family);
    row('Nominal',component.id==='stack'||component.id==='wye'?'DN100 stack / DN40 branch':'DN40 waste');
    row('Geometry',component.path.length+' modelled centreline points; generic part representation');
    row('Install',component.installationNotes[0]??'Supplier installation detail required');
    row('Ports',component.portIds.join(' · '));
    row('Supplier','Not selected. Sockets, bend radii and materials unverified.');
  }else if(joint){
    row('From',joint.from);row('To',joint.to);
    row('Method',joint.method);row('Assumed socket insertion',joint.socketDepthAssumedMm+' mm');
    row('Product match','Unverified');
  }else if(opening){
    row('Axis',opening.axis);row('Opening',opening.boreDiameterMm+' mm');
    row('Sleeve OD',opening.sleeveODMm+' mm');
    row('Hosts',opening.hostIds.join(' / '));
    row('Detail status','Penetration and control-plane sealing not verified');
  }else if(support){
    row('Maximum span assumed',support.maxAssumedSpanMm+' mm');row('Bracket','Supplier not selected');
  }else if(frame){
    row('Category',frame.kind);row('Structural',frame.structural?'Yes — do not cut automatically':'No');
  }
  const related=solution.findings.filter(f=>f.ownerId===selected);
  if(related.length)row('Issues',related.map(f=>f.code).join('; '));
}
function highlightParts():void {
  for(const el of document.querySelectorAll<HTMLButtonElement>('.part-list button'))
    el.classList.toggle('active',el.dataset.id===selected);
}
function partSelector():void {
  const list=$('partList');list.replaceChildren();
  const keys=[
    ...model.components.map(c=>({id:c.id,label:c.name})),
    ...model.penetrations.map(c=>({id:c.id,label:c.id.replace('opening:','Sleeve ')})),
    ...model.supports.map(c=>({id:c.id,label:c.id.replace('bracket:','Support ')})),
    ...model.joints.map(j=>({id:j.id,label:j.id.replace('joint:','Socket #')})),
  ];
  for(const key of keys){
    const button=newElement('button','',key.label);
    button.dataset.id=key.id;button.type='button';
    button.addEventListener('click',()=>{selected=key.id;updateDetails();highlightParts();});
    list.append(button);
  }
  highlightParts();
}
function issueList():void {
  const output=$('issues');output.replaceChildren();
  const ordered=[...solution.findings].sort((a,b)=>
    Number(a.severity==='review')-Number(b.severity==='review'));
  const blocks=ordered.filter(x=>x.severity==='block');
  $('issuesCount').textContent='('+blocks.length+' blocked / '+(ordered.length-blocks.length)+' review)';
  for(const f of ordered.slice(0,11)){
    const article=newElement('article','finding '+(f.severity==='block'?'block':''));
    article.append(newElement('strong','',f.code.replaceAll('_',' ')),
      newElement('p','',f.description));
    article.title='Select '+f.ownerId;
    article.tabIndex=0;article.setAttribute('role','button');
    const activate=()=>{selected=f.ownerId;updateDetails();highlightParts();};
    article.addEventListener('click',activate);
    article.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}
    });
    output.append(article);
  }
  if(ordered.length>11)output.append(newElement('p','',String(ordered.length-11)+' more review findings in the model.'));
}
function metrics():void {
  const s=solution;
  $('capacity').textContent=number(s.capacityLps,3)+' L/s';
  $('depth').textContent=number(s.waterDepthMm,1)+' mm';
  $('fill').textContent=number(s.fillPercent,1)+'%';
  $('velocity').textContent=number(s.velocityMps,2)+' m/s';
  $('transit').textContent=number(s.transitSeconds,2)+' s';
  $('residual').textContent=number(s.conservationResidualLps,3)+' L/s';
  $('dropDetail').textContent=number(s.fallMm,1)+' mm / '+number(s.branchLengthMm/1000,2)+' m';
  $('pathDetail').textContent='DN40 PVC-U · '+model.joints.length+' joints · '+model.supports.length+' supports';
  const outcome=$('outcome');
  outcome.className='outcome '+(s.status==='indicative-pass'?'pass':'blocked');
  const blocks=s.findings.filter(f=>f.severity==='block');
  if(s.status==='indicative-pass'){
    $('resultName').textContent='MODEL CHECKS PASS · NOT CODE VERIFIED';
    $('resultExplanation').textContent='Steady part-full branch result is available. Tracer speed follows '+number(s.velocityMps,2)+' m/s. Supplier details, trap/vent and statutory checks remain unresolved.';
    $('stateDetail').textContent='Indicative model pass';
  }else if(s.status==='off'){
    $('resultName').textContent='FIXTURE OFF · NO DISCHARGE';
    $('resultExplanation').textContent='No water movement is shown because the applied fixture demand is zero.';
    $('stateDetail').textContent='Demand 0 L/s';
  }else{
    $('resultName').textContent='SOLVER STOPPED · '+blocks.length+' HARD FAILURE'+(blocks.length===1?'':'S');
    $('resultExplanation').textContent='Water tracer stopped. '+(blocks[0]?.description??'Invalid scenario')+
      '. Correct the input or component issue to resume.';
    $('stateDetail').textContent='Blocked: '+blocks.map(x=>x.code).slice(0,2).join(', ');
  }
  $('play').textContent=playing?'Pause':'Play';
  $<HTMLButtonElement>('play').disabled=s.status!=='indicative-pass';
  $<HTMLOutputElement>('demandLabel').textContent=number(s.dischargeLps,2)+' L/s';
  $('passes').replaceChildren(...s.verifiedChecks.map(msg=>newElement('div','',msg)));
  issueList();
}
function svgSection():void {
  const svg=$('sectionSvg') as unknown as SVGSVGElement;
  const X=(v:number)=>100+(v-700)*.32;
  const Y=(v:number)=>55+(4000-v)*.18;
  const path=(id:string):string=>{
    const component=model.components.find(c=>c.id===id);
    if(!component)return '';
    return component.path.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[2]).toFixed(1)).join(' ');
  };
  const all=['basin','trap','adapter','pipe-wall','bend-top','dropper','bend-bottom','grade-branch','wye','stack'];
  const s=solution;
  const success=s.status==='indicative-pass';
  const waterY=(p:readonly number[])=>Y(p[2]-model.input.diameterMm/2+(s.waterDepthMm??0));
  const branchA=model.gradedStart,branchB=model.gradedEnd;
  const marker=(x:number,y:number,label:string,desc:string)=>'<g><circle cx="'+x+'" cy="'+y+'" r="5" fill="#4d7d91" stroke="#fff" stroke-width="2"/><text x="'+(x+9)+'" y="'+(y-9)+'" font-size="11" fill="#3f5964">'+label+'</text><title>'+desc+'</title></g>';
  const pipeList=all.map(id=>'<path d="'+path(id)+'" fill="none" stroke="'+
    (id==='grade-branch'?(success?'#507e8c':'#c46961'):'#78969e')+
    '" stroke-width="'+(id==='stack'?11:6)+'" stroke-linejoin="round" stroke-linecap="round"/>').join('');
  // True elevations are projected; wall y-coordinates and the trap loop are out-of-plane in this longitudinal view.
  const overlays=success&&s.waterDepthMm!==null?
    '<path d="M '+X(branchA[0])+' '+waterY(branchA)+' L '+X(branchB[0])+' '+waterY(branchB)+
    '" stroke="#10a6d4" stroke-width="3" fill="none" stroke-dasharray="6 5"/>' : '';
  svg.innerHTML='<rect x="0" y="0" width="800" height="410" fill="#e7ecea"/>'+
    '<rect x="20" y="'+Y(3000)+'" width="760" height="'+(Y(2720)-Y(3000))+'" fill="#d5c5ae" opacity=".18"/>'+
    '<path d="M 20 '+Y(3000)+' H 780" stroke="#8e9f9d" stroke-width="4"/>'+
    '<path d="M 20 '+Y(2975)+' H 780" stroke="#99adaa" stroke-width="1" stroke-dasharray="7 6"/>'+
    '<path d="M 20 '+Y(2720)+' H 780" stroke="#aa966f" stroke-width="2" stroke-dasharray="6 4"/>'+
    '<text x="25" y="'+(Y(3000)-8)+'" fill="#5c6f73" font-size="11">Upper floor FFL +3000</text>'+
    '<text x="25" y="'+(Y(2720)+14)+'" fill="#806c55" font-size="11">Framed joist / services cavity</text>'+
    '<rect x="'+(X(850)-10)+'" y="'+Y(3030)+'" width="20" height="'+(Y(2960)-Y(3030))+'" fill="#6da4a3" opacity=".27"/>'+
    '<rect x="'+(X(850)-30)+'" y="'+Y(3375)+'" width="60" height="120" rx="12" fill="#cbd8d4" stroke="#9db1af"/>'+
    pipeList+overlays+
    marker(X(850),Y(3450),'Basin waste','DN40 tailpiece and trap')+
    marker(X(850),Y(3320),'Trap / wall','P-trap + adapter + wall sleeve')+
    marker(X(850),Y(2990),'Floor sleeve','115 mm aperture, joist bay')+
    marker(X(930),Y(2880),'Swept bend','90 degree bottom bend')+
    marker(X(2560),Y(branchB[2]),'45° wye','Branch DN40 into soil DN100')+
    marker(X(2660),Y(2580),'DN100 stack','Downstream not engineered')+
    '<g transform="translate(510 32)"><rect width="270" height="78" rx="5" fill="#f8fbf8" stroke="#b4c3bf"/>'+
    '<text x="12" y="20" font-size="12" fill="#344951" font-weight="bold">GRADED BRANCH / SOLVER</text>'+
    '<text x="12" y="41" font-size="12" fill="#40565e">Length '+number(s.branchLengthMm,0)+' mm · Fall '+number(s.fallMm,1)+' mm</text>'+
    '<text x="12" y="61" font-size="12" fill="#40565e">Normal water depth '+number(s.waterDepthMm,1)+' mm</text></g>'+
    '<text x="27" y="385" font-size="10" fill="#687b80">Projection for coordination; hydraulic fittings, airflow and manufacturer profiles not certified.</text>';
}
function updateModel():void {
  model=createBasinModel(scenario());
  solution=solveBasinDrain(model);
  metrics();svgSection();partSelector();updateDetails();
  if(viewport)viewport.show(model,solution,layers,selected,playing);
}
function setView(next:'3d'|'section'):void{
  view=next;
  $('view3d').hidden=next!=='3d';
  $('sectionView').hidden=next!=='section';
  $('mode3d').classList.toggle('active',next==='3d');
  $('modeSection').classList.toggle('active',next==='section');
  if(next==='3d')viewport?.fit();
}
for(const key of ['demand','grade','diameter','joistFault','jointFault'])
  $(key).addEventListener('input',updateModel);
for(const [input,name] of [['showFrame','frame'],['showJoints','joints'],['showWater','water']] as const)
  $<HTMLInputElement>(input).addEventListener('change',event=>{
    layers[name]=(event.currentTarget as HTMLInputElement).checked;
    viewport?.show(model,solution,layers,selected,playing);
  });
$('mode3d').addEventListener('click',()=>setView('3d'));
$('modeSection').addEventListener('click',()=>setView('section'));
$('fit').addEventListener('click',()=>viewport?.fit());
$('play').addEventListener('click',()=>{
  if(solution.status!=='indicative-pass')return;
  playing=!playing;
  viewport?.setPlaying(playing);
  $('play').textContent=playing?'Pause':'Play';
});
$('reset').addEventListener('click',()=>{
  $<HTMLInputElement>('demand').value='0.12';
  $<HTMLSelectElement>('grade').value='50';
  $<HTMLSelectElement>('diameter').value='38';
  $<HTMLInputElement>('joistFault').checked=false;
  $<HTMLInputElement>('jointFault').checked=false;
  selected='grade-branch';playing=true;
  updateModel();setView(view);
});
updateModel();setView(view);
