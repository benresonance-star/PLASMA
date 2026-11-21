import { useEffect,useState } from 'react';
import {Camera,FileVideo2,LocateFixed,ScanLine,ShieldAlert,UploadCloud} from 'lucide-react';
import { apiBaseUrl } from '../api-client.js';
import './hotel-place-lens.css';

interface Observation {
  readonly id:string;
  readonly metadata:{
    readonly observation:{readonly name:string;readonly mediaKind:string;readonly capturedAt:string};
    readonly fit:{readonly rmsResidualMm:number;readonly maxResidualMm:number;readonly controlCount:number;
      readonly surveyCertified:false;readonly yawDeg:number};
  };
}
export interface PlaceLensProps {
  readonly modelId:string|null;
  readonly branchId:string|null;
  readonly headHash:string|null;
  readonly hotelId:string|null;
  readonly onRevisionUpdated?:(result:{
    readonly headHash:string;readonly eventId:string;readonly action:string;
  })=>void;
}
type CaptureKind='photo'|'video'|'gaussian-splat'|'point-cloud';
function isControlArray(x:unknown):x is readonly {
  id:string;observedMm:readonly [number,number,number];designMm:readonly [number,number,number];
}[]{
  return Array.isArray(x) && x.length>=4 && x.length<=50 &&
    x.every((r:unknown)=>{
      const p=r as Record<string,unknown>;
      return r!==null&&typeof r==='object'&&typeof p['id']==='string'&&
        ['observedMm','designMm'].every(key=>
          Array.isArray(p[key]) && (p[key] as unknown[]).length===3 &&
          (p[key] as unknown[]).every(n=>typeof n==='number'&&Number.isFinite(n)));
    });
}
export function HotelPlaceLens({modelId,branchId,headHash,hotelId,onRevisionUpdated}:PlaceLensProps){
  const [previewUrl,setPreviewUrl]=useState<string|null>(null);
  const [captureKind,setCaptureKind]=useState<CaptureKind>('photo');
  const [captureName,setCaptureName]=useState('');
  const [sourceRef,setSourceRef]=useState('');
  const [controlsText,setControlsText]=useState('');
  const [records,setRecords]=useState<Observation[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [expanded,setExpanded]=useState(false);
  const base=modelId?apiBaseUrl()+'/models/'+encodeURIComponent(modelId)+'/hotels/riverside/site-observations':'';
  useEffect(()=>{
    if(!base||!branchId)return;
    let active=true;
    void fetch(base+'?branchId='+encodeURIComponent(branchId)).then(res=>res.json())
      .then((data:unknown)=>{
        const x=data as {observations?:Observation[]};
        if(active&&Array.isArray(x.observations))setRecords(x.observations);
      }).catch(()=>{});
    return()=>{active=false;};
  },[base,branchId,headHash]);
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);},[previewUrl]);
  function onLocalFile(file:File|undefined){
    if(!file)return;
    const extension=file.name.split('.').pop()?.toLowerCase()??'';
    const kind:CaptureKind=file.type.startsWith('image/')?'photo':
      file.type.startsWith('video/')?'video':
      ['splat','ksplat','ply'].includes(extension)?'gaussian-splat':'point-cloud';
    setCaptureKind(kind);
    setCaptureName(file.name);
    setSourceRef('local:'+file.name);
    setPreviewUrl(kind==='photo'||kind==='video'?URL.createObjectURL(file):null);
    setStatus(kind==='gaussian-splat'
      ?'Gaussian capture selected; native Gaussian rendering is not yet enabled. Only metadata and control fits can be reviewed.'
      :'Local capture preview; bytes remain in this browser session, not in the project library.');
    setExpanded(true);
  }
  async function saveFit(){
    if(!base||!branchId||!headHash||!hotelId)return;
    setError('');setStatus('');
    let controlData:unknown;
    try{controlData=JSON.parse(controlsText);}catch{setError('Control points must be a valid JSON array.');return;}
    if(!isControlArray(controlData)){
      setError('Supply 4–50 controls, each with id, observedMm [x,y,z] and designMm [x,y,z].');
      return;
    }
    if(!sourceRef.startsWith('local:')&&!sourceRef.startsWith('library:')&&!sourceRef.startsWith('sha256:')){
      setError('Provide a local or library media reference. Remote URLs are not accepted as evidence.');return;
    }
    const captureId='capture-'+Date.now().toString(36);
    setSaving(true);
    try{
      const response=await fetch(base,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          branchId,expectedHeadHash:headHash,hotelId,
          observation:{
            captureId,name:captureName||'Untitled capture',mediaKind:captureKind,
            capturedAt:new Date().toISOString(),mediaRef:sourceRef,
            controls:controlData,provenance:'user-supplied',
          },
        }),
      });
      const data=await response.json() as{
        status?:string;summary?:string;headHash?:string;eventId?:string;
        fit?:{rmsResidualMm:number;maxResidualMm:number};
      };
      if(!response.ok)throw new Error(data.summary??'Capture rejected');
      setStatus('Recorded local fit: RMS '+(data.fit?.rmsResidualMm??0).toFixed(1)+
        ' mm, max '+(data.fit?.maxResidualMm??0).toFixed(1)+
        ' mm. Survey status remains unverified.');
      if(data.headHash&&data.eventId)onRevisionUpdated?.({
        headHash:data.headHash,eventId:data.eventId,action:'Site capture: '+captureName+' (unverified local fit)',
      });
    }catch(e){setError(e instanceof Error?e.message:'Capture could not be recorded');}
    finally{setSaving(false);}
  }
  return <div className="hotel-place-lens" data-testid="hotel-place-lens">
    <div className="hotel-capture-stage">
      {previewUrl&&captureKind==='photo'
        ?<img src={previewUrl} alt="User-selected site photograph, locally previewed"/>
        :previewUrl&&captureKind==='video'
          ?<video src={previewUrl} controls playsInline aria-label="User-selected site video" />
          :<div className="hotel-capture-idle">
            <LocateFixed size={28}/>
            <strong>THE PLACE IS NOT YET CAPTURED</strong>
            <span>Photo · drone · video · Gaussian survey scene</span>
          </div>}
      <div className="hotel-capture-stamp">
        <span>{previewUrl?'LOCAL PREVIEW / USER SOURCE':'REALITY LAYER / SOURCE REQUIRED'}</span>
        <strong>NO SURVEYED GEOREFERENCE</strong>
      </div>
    </div>
    <div className="hotel-capture-toolbar">
      <label className="hotel-capture-upload" htmlFor="hotel-site-media">
        <UploadCloud size={14}/> Import site capture
      </label>
      <input id="hotel-site-media" type="file"
        accept="image/*,video/*,.splat,.ksplat,.ply,.spz"
        onChange={event=>onLocalFile(event.target.files?.[0])}/>
      <button type="button" onClick={()=>setExpanded(!expanded)}>
        <ScanLine size={14}/> Registration
      </button>
    </div>
    {status&&<div className="hotel-capture-status">{status}</div>}
    <div className="hotel-capture-records">
      <div><Camera size={13}/> Observations <b>{records.length}</b></div>
      {records.slice(-3).map(item=><div className="hotel-capture-record" key={item.id}>
        <FileVideo2 size={13}/><span>{item.metadata.observation.name}</span>
        <strong>±{item.metadata.fit.rmsResidualMm.toFixed(0)} mm</strong>
      </div>)}
      {!records.length&&<p>No persisted captured reality or registration evidence.</p>}
    </div>
    {expanded&&<div className="hotel-fit-editor">
      <strong>LOCAL RIGID CONTROL FIT</strong>
      <p>Four or more user-supplied measured control pairs. Computes XY yaw, XYZ translation and residuals. No inferred GPS, scale or survey certification.</p>
      <label>Capture reference<input value={sourceRef} onChange={e=>setSourceRef(e.target.value)}
        placeholder="library:capture-001 or local:filename.jpg"/></label>
      <label>Control-point pairs<textarea rows={5} spellCheck={false}
        value={controlsText} onChange={e=>setControlsText(e.target.value)}
        placeholder={'[{"id":"CP1","observedMm":[0,0,0],"designMm":[100,200,0]}, ...]'}/>
      </label>
      <button type="button" disabled={saving||!headHash} onClick={()=>void saveFit()}>
        <ScanLine size={14}/> Record measured fit
      </button>
      {error&&<p role="alert" className="hotel-fit-error"><ShieldAlert size={13}/>{error}</p>}
    </div>}
  </div>;
}
