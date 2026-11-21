import { useState } from 'react';
import { AlertTriangle, ArrowRight, FileCheck, FileText, Gauge, GitBranch, MapPinned, Network, ShieldCheck } from 'lucide-react';
import type { FusionContext } from './FusionStudio.js';
import { apiBaseUrl } from '../api-client.js';
import './continuity.css';

type Stage = 'F04'|'F05'|'F06'|'F07'|'F08';
interface ViewerProps {
  readonly fusion: FusionContext | null;
  readonly selectedSemanticId: string | null;
  readonly onSelectSemantic: (id:string)=>void;
  readonly modelId: string|null;
  readonly branchId: string|null;
  readonly headHash: string|null;
  readonly onDetail?: (svg:string|null)=>void;
  readonly onRegistration?: (value:Registration|null)=>void;
}
interface Finding {
  readonly code: string; readonly severity:string; readonly subjectId:string; readonly summary:string;
}
interface SectionSheet { readonly svg:string; readonly regionCount:number; readonly unsupported:readonly string[]; readonly printScale:string; }
interface Registration {
  readonly rmsResidualMm:number; readonly maximumResidualMm:number;
  readonly pointCount:number; readonly mmPerPixel:number;
  readonly rotationDeg:number; readonly status:string;readonly surveyCertified:false;
}
type Review = Record<string,unknown>;
function obj(v:unknown):Record<string,unknown>|null{
  return v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown>:null;
}
const stages:readonly {key:Stage;label:string;icon:typeof FileText}[]=[
  {key:'F04',label:'Construct',icon:FileCheck},
  {key:'F05',label:'Detail',icon:FileText},
  {key:'F06',label:'Site fit',icon:MapPinned},
  {key:'F07',label:'Causal',icon:Network},
  {key:'F08',label:'Gate',icon:Gauge},
];
const EXAMPLE = JSON.stringify([
  {id:'A',pixel:[120,140],localMm:[0,0]},
  {id:'B',pixel:[420,140],localMm:[6000,0]},
  {id:'C',pixel:[120,440],localMm:[0,6000]},
],null,2);
export function ContinuityInspector(props:ViewerProps){
  const {fusion,selectedSemanticId,onSelectSemantic,modelId,branchId,headHash,onDetail,onRegistration}=props;
  const [stage,setStage]=useState<Stage>('F04');
  const [review,setReview]=useState<Review|null>(null);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState('');
  const [sectionY,setSectionY]=useState('0');
  const [controlText,setControlText]=useState('');
  function selectStage(next:Stage){
    setStage(next);setReview(null);setError('');
    if(next!=='F05')onDetail?.(null);
  }
  async function run(){
    setRunning(true);setError('');setReview(null);
    try{
      let url:string;
      let body:unknown;
      if(stage==='F06'){
        if(!controlText.trim())throw new Error('Enter at least three measured pixel and local-site coordinate pairs.');
        let points:unknown;
        try{points=JSON.parse(controlText) as unknown;}catch{throw new Error('Invalid control point JSON');}
        url='/imports/fusion/site-registration-preview';
        body={points};
      } else {
        if(!fusion || !modelId || !branchId || !headHash)
          throw new Error('Connect Build and Loft sources and open a versioned Plasma model.');
        url='/imports/fusion/continuity-preview';
        body={
          buildProject:fusion.buildProject, loftProject:fusion.loftProject,
          bindings:fusion.bindings,
          expectedSourceHashes:{
            build:fusion.preview.sources.find(s=>s.system==='build')?.sourceHash,
            loft:fusion.preview.sources.find(s=>s.system==='loft')?.sourceHash,
          },
          modelId,branchId,expectedHeadHash:headHash,stage,
          ...(stage==='F05'?{sectionYmm:Number(sectionY)}:{}),
          ...(stage==='F07'?{selectedId:selectedSemanticId}:{}),
        };
      }
      const response=await fetch(apiBaseUrl()+url,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
      });
      const payload:unknown=await response.json();
      if(!response.ok)
        throw new Error(String(obj(payload)?.['summary'] ?? obj(payload)?.['failureCode'] ?? 'Continuity review rejected'));
      const result=payload as Review;
      setReview(result);
      if(stage==='F05')onDetail?.(String(obj(result['before'])?.['svg'] ?? ''));
      if(stage==='F06')onRegistration?.(result as unknown as Registration);
    } catch(err){
      setError(err instanceof Error?err.message:'Review unavailable');
    } finally{setRunning(false);}
  }
  const findings=Array.isArray(review?.['findings']) ? review['findings'] as Finding[] : [];
  const gates=Array.isArray(review?.['gates']) ? review['gates'] as {name:string;status:string;evidence:string}[] : [];
  const nodes=Array.isArray(review?.['nodes']) ? review['nodes'] as {id:string;label:string;role:string}[] : [];
  const edges=Array.isArray(review?.['edges']) ? review['edges'] as {from:string;to:string;type:string}[] : [];
  const sheet=obj(review?.['before']) as SectionSheet|null;
  const registration=stage==='F06' && review ? review as unknown as Registration : null;
  return (
    <section className="continuity" aria-label="Fusion architectural continuity instruments">
      <div className="continuity-header">
        <strong>PLASMA / INSTRUMENTS</strong><span>F04—F08</span>
      </div>
      <div className="continuity-tabs">
        {stages.map(item=><button type="button" key={item.key} onClick={()=>selectStage(item.key)}
          aria-pressed={stage===item.key} className={stage===item.key?'active':''}>
          <item.icon size={12}/><span>{item.label}</span></button>)}
      </div>
      <div className="continuity-intro">
        {stage==='F04' && <p>Audit actual Build wall-host relationships and imported geometry links. Not a code or engineering certification.</p>}
        {stage==='F05' && <p>Render A3, 1:5 material sections from supported Loft source geometry. This is not an issued construction detail.</p>}
        {stage==='F06' && <p>Fit photographic pixel locations to measured local site coordinates. Result remains provisional with reported residuals.</p>}
        {stage==='F07' && <p>Trace actual semantic and parameter relationships from the selected component, without inferred rules.</p>}
        {stage==='F08' && <p>Show what is demonstrated and what still prevents a hotel-scale BIM release.</p>}
      </div>
      {stage==='F05' && <label className="continuity-field">Section Y (mm)
        <input value={sectionY} type="number" onChange={e=>setSectionY(e.target.value)}/>
      </label>}
      {stage==='F06' && <label className="continuity-field">Control points (JSON)
        <textarea rows={5} value={controlText} onChange={e=>setControlText(e.target.value)}
          placeholder={EXAMPLE} aria-label="Site control point pairs"/>
        <span>Illustrative format only. Enter your measured coordinates—do not treat example coordinates as a survey.</span>
      </label>}
      <button type="button" className="continuity-run" onClick={()=>void run()} disabled={running}>
        {running?'Analysing…':'Run '+stages.find(item=>item.key===stage)?.label+' preview'}<ArrowRight size={14}/>
      </button>
      {error && <p role="alert" className="continuity-error">{error}</p>}
      {review && <div className="continuity-results">
        <div className="continuity-status"><ShieldCheck size={14}/>{stage} / Review evidence generated — no publication</div>
        {stage==='F04' && <>
          <div className="continuity-metrics">
            <div><span>Openings</span><strong>{String(review['hostedOpenings'])}</strong></div>
            <div><span>Hosted</span><strong>{String(review['hostLinks'])}</strong></div>
            <div><span>Geometry links</span><strong>{String(review['linkedRepresentations'])}</strong></div>
          </div>
          {findings.map(f=><div className="continuity-finding" key={f.code+f.subjectId}>
            <AlertTriangle size={13}/><span><strong>{f.code}</strong>{f.summary}</span>
          </div>)}
        </>}
        {stage==='F05' && sheet && <>
          <div className="continuity-metrics"><div><span>Material regions</span><strong>{sheet.regionCount}</strong></div><div><span>Print</span><strong>A3 / {sheet.printScale}</strong></div></div>
          <img className="continuity-drawing" alt="Derived 1:5 Loft sectional study, not for construction"
            src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(sheet.svg)}/>
          {sheet.unsupported.length>0 && <p>{sheet.unsupported.length} unsupported feature histories are excluded and disclosed.</p>}
        </>}
        {stage==='F06' && registration && <>
          <div className="continuity-metrics">
            <div><span>Control points</span><strong>{registration.pointCount}</strong></div>
            <div><span>RMS deviation</span><strong>{registration.rmsResidualMm.toFixed(1)} mm</strong></div>
            <div><span>Max residual</span><strong>{registration.maximumResidualMm.toFixed(1)} mm</strong></div>
          </div>
          <p className="continuity-alert">Estimated local registration only. No survey certification or Gaussian registration.</p>
        </>}
        {stage==='F07' && <>
          <div className="continuity-metrics"><div><span>Nodes</span><strong>{nodes.length}</strong></div><div><span>Edges</span><strong>{edges.length}</strong></div></div>
          <div className="continuity-graph">
            {nodes.map((node)=><button type="button" key={node.id}
              className={node.id===selectedSemanticId?'active':''}
              onClick={()=>onSelectSemantic(node.id)}>
                <GitBranch size={12}/><strong>{node.label}</strong><small>{node.role}</small></button>)}
          </div>
          <p>Actual relationships: {edges.map(e=>e.type).slice(0,8).join(' · ')||'None'}</p>
        </>}
        {stage==='F08' && <>
          <div className="continuity-metrics">
            <div><span>Source objects</span><strong>{String(review['sourceObjectCount'])}</strong></div>
            <div><span>Occurrences</span><strong>{String(review['occurrences'])}</strong></div>
            <div><span>Certified</span><strong>NO</strong></div>
          </div>
          {gates.map(g=><div className="continuity-finding" key={g.name}>
            <AlertTriangle size={13}/><span><strong>{g.name} — OPEN</strong>{g.evidence}</span></div>)}
        </>}
      </div>}
    </section>
  );
}
