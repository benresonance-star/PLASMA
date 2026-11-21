import { AlertTriangle,ArrowRight,CheckCircle2,Network,ShieldCheck } from 'lucide-react';
import './hotel-causal-lens.css';

export interface HotelProposal {
  readonly status:'governed-window-proposal';
  readonly candidateHash:string;readonly headHash:string;
  readonly windowWidthBeforeMm:number;readonly windowWidthAfterMm:number;
  readonly affectedRoomCount:number;readonly linkedModuleIds:readonly string[];
  readonly claims:readonly {
    id:string;label:string;before:number;after:number;delta:number;unit:string;
    basis:'computed-from-Loft-source'|'bounded-design-constraint';
    evidence:readonly string[];
  }[];
  readonly causal:{
    nodes:readonly {id:string;label:string;kind:string;state:string}[];
    edges:readonly {from:string;to:string;relation:string}[];
  };
  readonly unresolved:readonly string[];
  readonly engineeringApproved:false;
}
export function HotelCausalLens(props:{
  readonly proposal:HotelProposal|null;
  readonly baselineWidth:number|undefined;
  readonly windowRevision:number;
  readonly documentCount:number;
  readonly roomCount:number;
}){
  const {proposal,baselineWidth,windowRevision,documentCount,roomCount}=props;
  const definitions=proposal?.causal.nodes.filter(x=>x.kind==='definition')??[
    {id:'suite-standard',label:'Standard suite'},
    {id:'suite-accessible',label:'Accessible suite'},
    {id:'suite-corner',label:'Corner suite'},
  ];
  return <section className="hotel-causal-lens" data-testid="hotel-causal-lens">
    <header><Network size={14}/><span>CAUSAL FABRIC / WINDOW A4</span>
      <small>{proposal?'PROPOSED':'CURRENT'}</small></header>
    <div className="hotel-causal-driver">
      <span>AUTHORITATIVE SOURCE DRIVER</span>
      <strong>A4 · {proposal?.windowWidthAfterMm??baselineWidth??'—'} mm</strong>
      <small>Loft window-a4 / r{windowRevision}</small>
    </div>
    <div className="hotel-causal-arrow"><ArrowRight size={15}/></div>
    <div className="hotel-causal-defs">
      {definitions.map(item=><span key={item.id}>{item.label}</span>)}
    </div>
    <div className="hotel-causal-arrow"><ArrowRight size={15}/></div>
    <div className="hotel-causal-occurrences">
      <CheckCircle2 size={15}/>{roomCount} guestroom instances
    </div>
    <div className="hotel-causal-arrow"><ArrowRight size={15}/></div>
    <div className="hotel-causal-reps">
      <span>3D MODEL</span><span>{documentCount} DRAWINGS</span><span>QUANTITY TRACE</span>
    </div>
    {proposal&&<div className="hotel-causal-claims" data-testid="hotel-causal-evidence">
      <div className="hotel-causal-claims-title"><ShieldCheck size={14}/>
        Geometry-derived quantities / not a simulation</div>
      {proposal.claims.map(item=><div className="hotel-causal-claim" key={item.id}>
        <span>{item.label}</span>
        <strong className={item.delta>=0?'increase':'decrease'}>
          {item.delta>0?'+':''}{item.delta.toFixed(2)} {item.unit}
        </strong>
        <small>{item.basis}</small>
      </div>)}
      <div className="hotel-causal-unknown"><AlertTriangle size={14}/>
        Thermal, fire, façade weather, acoustic, cost and carbon remain unverified.
      </div>
    </div>}
  </section>;
}
