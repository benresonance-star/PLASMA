import { useEffect,useMemo,useState } from 'react';
import { Box,ChevronDown,Layers3,Link2,RotateCcw } from 'lucide-react';
import { apiBaseUrl } from '../api-client.js';
import './hotel-assembly-lens.css';

interface ModulePart {
  readonly id:string;readonly material:string;readonly role:string;
  readonly dimensionsMm:{readonly W:number;readonly H:number;readonly D:number};
}
interface ModuleDetail {
  readonly moduleId:string;readonly headHash:string;readonly revision:number;
  readonly sourceHash:string;readonly sourceProjectId:string;
  readonly windowWidthMm:number;readonly parts:readonly ModulePart[];
}
export interface AssemblyLensProps {
  readonly modelId:string|null;readonly branchId:string|null;
  readonly headHash:string|null;readonly moduleId:string;
  readonly selectedRoomId:string|null;
}
export function HotelAssemblyLens({
  modelId,branchId,headHash,moduleId,selectedRoomId,
}:AssemblyLensProps){
  const [detail,setDetail]=useState<ModuleDetail|null>(null);
  const [selectedPart,setSelectedPart]=useState<string|null>(null);
  const [expanded,setExpanded]=useState(false);
  const key=moduleId.split(':').pop()??'window-a4';
  useEffect(()=>{
    setDetail(null);setSelectedPart(null);
    if(!modelId||!branchId||!headHash)return;
    let active=true;
    const path=apiBaseUrl()+'/models/'+encodeURIComponent(modelId)+
      '/hotels/riverside/modules/'+encodeURIComponent(key)+
      '?branchId='+encodeURIComponent(branchId);
    void fetch(path).then(async res=>{
      if(!res.ok)throw new Error('Source details unavailable');
      return await res.json() as ModuleDetail;
    }).then(data=>{
      if(active&&data.headHash===headHash){
        setDetail(data);
        setSelectedPart(data.parts.find(p=>p.role==='glazing')?.id ??
          data.parts[0]?.id??null);
      }
    }).catch(()=>{});
    return()=>{active=false;};
  },[modelId,branchId,headHash,key]);
  const focusedPart=detail?.parts.find(p=>p.id===selectedPart);
  const grouped=useMemo(()=>{
    const groups=new Map<string,ModulePart[]>();
    for(const part of detail?.parts??[]){
      const list=groups.get(part.role)??[];
      list.push(part);groups.set(part.role,list);
    }
    return [...groups];
  },[detail]);
  const window=key==='window-a4';
  const w=detail?.windowWidthMm??1800;
  return <section className="hotel-assembly-lens" data-testid="hotel-assembly-lens">
    <div className="hotel-assembly-header">
      <Layers3 size={14}/>
      <div><strong>{window?'A4 / WINDOW SYSTEM':'LOFT / '+key.toUpperCase().replace(/-/g,' ')}
        </strong><small>Versioned component geometry</small></div>
      <span>r{detail?.revision??'—'}</span>
    </div>
    <div className="hotel-assembly-drawing">
      {window?<svg viewBox="0 0 300 220" aria-label="Source-derived A4 window exploded technical study">
        <defs>
          <linearGradient id="hotel-glazing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c1d8d6"/><stop offset=".6" stopColor="#668a91"/>
            <stop offset="1" stopColor="#263f48"/>
          </linearGradient>
        </defs>
        <path d="M 40 34 L 248 18 L 271 180 L 64 198 Z" fill="#4d5150"
          opacity=".35" stroke="#b7bbb2"/>
        <path d="M 33 31 L 223 17 L 247 179 L 55 196 Z" fill="#bdb5a6" stroke="#c4a78d" strokeWidth="2"/>
        <path d="M 43 43 L 216 30 L 237 171 L 64 184 Z" fill="url(#hotel-glazing)"
          opacity=".93" stroke="#6e8486" strokeWidth="2"/>
        <path d="M 130 37 L 147 177" stroke="#aa8769" strokeWidth="9"/>
        <path d="M 33 31 L 223 17 L 247 179 L 55 196 Z" fill="none"
          stroke="#b68b62" strokeWidth="8" strokeLinejoin="bevel"/>
        <path d="M 43 43 L 216 30 L 237 171 L 64 184 Z" fill="none"
          stroke="#d7b99a" strokeWidth="3"/>
        <path d="M 17 29 L 223 9 L 257 172 L 52 201" fill="none"
          stroke="#f7d8b6" strokeWidth="1" strokeDasharray="4 4"/>
        <line x1="61" y1="205" x2="246" y2="191" stroke="#c8d2ce"/>
        <text x="150" y="215" textAnchor="middle" fill="#e7e8dd" fontSize="10">{'W '+w+' mm'}</text>
        <text x="17" y="15" fill="#edbd9b" fontSize="9">SOURCE / SECTIONAL LAYERS</text>
        <circle cx="234" cy="36" r="4" fill="#eaa574"/>
        <path d="M 237 36 L 266 32" fill="none" stroke="#eaa574"/>
        <text x="270" y="34" fontSize="8" fill="#f0c2a4">A4</text>
      </svg>:<div className="hotel-assembly-summary">
        <Box size={33}/><strong>{detail?.parts.length??0} source solids</strong>
        <small>Pick a part to inspect source dimensions</small>
      </div>}
      <div className="hotel-assembly-tag">
        {selectedRoomId?.split(':').pop()??'SOURCE'} · {detail?.parts.length??0} LOFT PARTS
      </div>
    </div>
    <div className="hotel-assembly-focus">
      <span>SELECTED SOURCE PART</span>
      <strong>{focusedPart?.id??'Select a component'}</strong>
      <small>{focusedPart?.material??'No source part'} · {focusedPart?.role??'unclassified'}</small>
      <div>
        {focusedPart?.dimensionsMm?
          'W '+focusedPart.dimensionsMm.W+' · H '+focusedPart.dimensionsMm.H+
            ' · D '+focusedPart.dimensionsMm.D+' mm'
          :'Source dimensions unavailable'}
      </div>
    </div>
    <button className="hotel-assembly-toggle" type="button"
      onClick={()=>setExpanded(!expanded)}>
      <Link2 size={12}/> {detail?.sourceProjectId??'Linked source loading'}
      <ChevronDown size={12}/>
    </button>
    {expanded&&<div className="hotel-assembly-parts">
      {grouped.map(([role,parts])=><div key={role}>
        <strong>{role.toUpperCase()}</strong>
        {parts.map(part=><button className={selectedPart===part.id?'selected':''}
          key={part.id} type="button" onClick={()=>setSelectedPart(part.id)}>
          <span>{part.id}</span><small>{part.material}</small>
        </button>)}
      </div>)}
      <button className="hotel-assembly-reset" type="button"
        onClick={()=>setExpanded(false)}><RotateCcw size={12}/> Collapse assembly</button>
    </div>}
    <div className="hotel-assembly-warning">
      Exploded illustration / source dimensions · not a certified technical section
    </div>
  </section>;
}
