import { useEffect, useRef, useState } from 'react';
import { NorthstarStudio } from './NorthstarStudio.js';
import type { FusionContext } from './FusionStudio.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';

/** A DEV-ONLY browser qualification fixture. Never a user project or real site. */
const at = '2026-11-21T00:00:00.000Z';
const entity = (id: string, semanticType: string, name: string) => ({
  id, kind: 'Entity', semanticType, name,
  createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
});
const buildProject = {
  app: 'Build', schemaVersion: 2, savedAt: at,
  authoritativeGraph: {
    entities: [
      entity('entity:qa:wall', 'architecture.wall-front', 'Facade wall A4'),
      entity('entity:qa:window', 'architecture.hosted-opening', 'Guestroom window W-04'),
    ],
    parameters: [{
      id: 'parameter:qa:window-width', kind: 'Parameter', name: 'Window width',
      semanticType: 'architecture.window-width', createdAt: at, updatedAt: at,
      schemaVersion: '1.0.0', quantity: { value: 150, unit: 'mm' },
      role: 'design-variable', editableBy: ['user', 'agent'],
      affects: ['entity:qa:window'], domain: { min: 100, max: 280 },
    }],
    relationships: [{
      id: 'relationship:qa:host', kind: 'Relationship', semanticType: 'architecture.hosted-by',
      name: 'Window host', relationType: 'architecture.hosted-by',
      from: 'entity:qa:window', to: 'entity:qa:wall',
      createdAt: at, updatedAt: at, schemaVersion: '1.0.0',
    }],
  },
};
function part(id: string, material: string, width: number, height: number,
    depth: number, center: [number,number,number]) {
  return {
    definition: {
      id, material, parameters: { W: width, H: height, D: depth },
      features: [
        { id: id + ':sketch', type: 'sketch', plane: { type: 'datum', name: 'XY' },
          profile: { kind: 'rectangle', width: 'W', height: 'H' } },
        { id: id + ':solid', type: 'extrude', sketch: id + ':sketch', depth: 'D' },
      ],
    },
    occurrence: {
      id: id + ':01', partId: id, placement: { translation: center },
    },
  };
}
const components = [
  part('MasonryOuter', 'Brick masonry', 100, 90, 240, [-260, 0, 0]),
  part('TimberStud', 'Timber', 75, 90, 260, [-80, 0, 0]),
  part('Insulation', 'Thermal insulation', 52, 90, 240, [-4, 0, 0]),
  part('WindowFrame', 'Aluminium', 150, 90, 140, [150, 0, 70]),
  part('WindowGlass', 'Glazing', 14, 90, 140, [148, 0, 70]),
  part('ConcreteSlab', 'Concrete', 670, 95, 55, [0, 0, -70]),
];
const loftProject = {
  id: 'NorthstarQA', schemaVersion: 2, units: 'mm',
  parts: components.map((x) => x.definition),
  rootAssembly: 'A4',
  assemblies: [{ id: 'A4', instances: components.map((x) => x.occurrence) }],
};
const bindings = [{
  buildEntityId: 'entity:qa:window',
  loftAssemblyId: 'A4', loftInstanceId: 'WindowFrame:01',
}];

function boxMesh(id: string, semanticOwner: string,
  center:readonly [number,number,number], dims:readonly [number,number,number]):DisplayMeshInput{
  const [cx,cy,cz]=center,[w,h,d]=dims;
  const x0=cx-w/2,x1=cx+w/2,y0=cy-h/2,y1=cy+h/2,z0=cz-d/2,z1=cz+d/2;
  return {
    representationId:id,semanticOwner,
    vertices:[
      [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
    ],
    indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5],
  };
}
const fixtureMeshes: readonly DisplayMeshInput[] = [
  boxMesh('qa:slab','entity:qa:wall',[0,0,-80],[720,430,65]),
  boxMesh('qa:wall','entity:qa:wall',[-240,0,200],[85,250,460]),
  boxMesh('qa:window','entity:qa:window',[45,0,200],[155,85,250]),
  boxMesh('qa:frame','entity:qa:window',[45,0,320],[210,100,30]),
];
interface ModelFixture {modelId:string;branchId:string;headHash:string;}
export function NorthstarVisualQA(){
  const [state,setState]=useState<{context:FusionContext;model:ModelFixture}|null>(null);
  const [selection,setSelection]=useState<string|null>('entity:qa:window');
  const [error,setError]=useState('');
  const [sourceOpen,setSourceOpen]=useState(false);
  const [qaEvents,setQaEvents]=useState([
    {id:'qa:observation',kind:'QA capture',label:'Synthetic site fixture',atMs:100},
    {id:'qa:model',kind:'QA model',label:'Junction test assembly',atMs:200},
    {id:'qa:parameter',kind:'QA proposal',label:'Width review fixture',atMs:300},
  ]);
  const startup=useRef<Promise<{context:FusionContext;model:ModelFixture}>|null>(null);
  useEffect(()=>{
    let active=true;
    if(!startup.current) startup.current=(async()=>{
      const create=await fetch('/api/models',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({name:'SYNTHETIC / NORTHSTAR VISUAL QA'}),
      });
      if(!create.ok)throw new Error('API model bootstrap unavailable');
      const data=await create.json() as {model:{modelId:string};branchId:string;headHash:string};
      const result=await fetch('/api/imports/fusion/preview',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({buildProject,loftProject,bindings}),
      });
      const payload:unknown=await result.json();
      if(!result.ok)throw new Error('Source reconciliation rejected: '+JSON.stringify(payload));
      return {
        context:{preview:payload as FusionContext['preview'],buildProject,loftProject,bindings},
        model:{modelId:data.model.modelId,branchId:data.branchId,headHash:data.headHash},
      };
    })();
    void startup.current.then(value=>{
      if(!active)return;
      if(new URLSearchParams(window.location.search).get('stage')==='F03') {
        const bound=value.context.preview.bindings[0]?.loftOccurrenceId;
        if(bound)setSelection(bound);
      }
      setState(value);
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Fixture unavailable');});
    return()=>{active=false;};
  },[]);
  return <main style={{
    width:'100vw',height:'100svh',display:'flex',flexDirection:'column',overflow:'hidden',
    background:'#17252b',color:'#f1f3ef',
  }}>
    <header data-testid="northstar-qa-banner" style={{
      flex:'0 0 auto',minHeight:32,padding:'8px 16px',fontSize:11,
      letterSpacing:'.06em',background:'#aa4e35',color:'#fff',
    }}>VISUAL QA / SYNTHETIC WINDOW-JUNCTION FIXTURE — NOT A SURVEYED SITE, REAL HOTEL OR ISSUED BIM MODEL</header>
    {error && <p role="alert" style={{margin:15}}>{error}</p>}
    {!state && !error && <p style={{margin:20}}>Loading controlled Build / Loft / Plasma fixture…</p>}
    {state && <NorthstarStudio
      onClose={()=>window.location.assign('/')}
      onOpenFusion={()=>setSourceOpen(true)}
      fusion={state.context}
      selectedSemanticId={selection}
      onSelectSemantic={setSelection}
      meshes={fixtureMeshes}
      serviceMeshes={[]}
      qaSiteIllustration="/northstar-site-qa.svg"
      modelId={state.model.modelId}
      branchId={state.model.branchId}
      headHash={state.model.headHash}
      sessionEvents={qaEvents}
      onRevisionUpdated={({headHash,eventId,action,fusion})=>{
        setState((current)=>current?({
          context:fusion ?? current.context,
          model:{...current.model,headHash},
        }):current);
        setQaEvents((events)=>[...events,{
          id:eventId,kind:'fusion-source',label:action,atMs:Date.now(),
        }]);
      }}
    />}
    {sourceOpen&&<div role="dialog" aria-label="Controlled source mappings" style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:999,
      display:'grid',placeItems:'center',
    }}><section style={{background:'#fff',color:'#1f2b2b',padding:24,maxWidth:500}}>
      <h2 style={{fontWeight:700}}>Synthetic source identities</h2>
      <p style={{margin:'12px 0'}}>Build window W-04 → Loft occurrence WindowFrame:01. The other five Loft components are reference-only.</p>
      <p style={{margin:'12px 0'}}>No native B-rep, code compliance, site survey or production publication is claimed.</p>
      <button type="button" onClick={()=>setSourceOpen(false)}
        style={{background:'#24363a',color:'white',padding:'8px 14px'}}>Close</button>
    </section></div>}
  </main>;
}
