import { useEffect,useMemo,useState } from 'react';
import {GitBranch,GitCompareArrows,GitCommitHorizontal,History,ShieldAlert} from 'lucide-react';
import { apiBaseUrl } from '../api-client.js';
import './hotel-worldline.css';

type Track='place'|'design'|'documents'|'validate'|'construct'|'operate';
interface Entry{
  readonly eventId:string;readonly timestamp:string;readonly track:Track;
  readonly command:string;readonly description:string;readonly beforeHash:string;
  readonly afterHash:string;readonly actor:string;readonly targetIds:readonly string[];
  readonly documentEvidence:string;
}
interface Worldline{
  readonly status:'persistent-worldline';readonly headHash:string;
  readonly entries:readonly Entry[];
}
interface SnapshotPair{
  readonly beforeSnapshotId:string;readonly afterSnapshotId:string|null;
}
interface Diff{
  readonly addedIds:readonly string[];readonly removedIds:readonly string[];
  readonly changedIds:readonly string[];readonly fromHash:string;readonly toHash:string;
}
const TRACKS:readonly Track[]=['place','design','documents','validate','construct','operate'];
const COLORS:Readonly<Record<Track,string>>={
  place:'#6bb9dc',design:'#e7a06e',documents:'#d8bb78',
  validate:'#9ac4a6',construct:'#ba9eb2',operate:'#8eb7a1',
};
export function HotelWorldline(props:{
  readonly modelId:string|null;readonly branchId:string|null;readonly headHash:string|null;
  readonly snapshotPair:SnapshotPair|null;
}){
  const {modelId,branchId,headHash,snapshotPair}=props;
  const [data,setData]=useState<Worldline|null>(null);
  const [selectedTrack,setSelectedTrack]=useState<Track>('design');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [comparison,setComparison]=useState<Diff|null>(null);
  const [error,setError]=useState('');
  const base=modelId?apiBaseUrl()+'/models/'+encodeURIComponent(modelId)+'/hotels/riverside':'';
  useEffect(()=>{
    if(!branchId||!base)return;
    let active=true;
    void fetch(base+'/worldline?branchId='+encodeURIComponent(branchId))
      .then(async response=>{
        if(!response.ok)throw new Error('Worldline unavailable');
        return await response.json() as Worldline;
      }).then(result=>{if(active&&result.headHash===headHash)setData(result);})
      .catch(err=>{if(active)setError(err instanceof Error?err.message:'Unavailable');});
    return()=>{active=false;};
  },[base,branchId,headHash]);
  const selected=useMemo(()=>data?.entries.find(e=>e.eventId===selectedId)??null,[data,selectedId]);
  const trackEntries=data?.entries.filter(e=>e.track===selectedTrack)??[];
  async function compare(){
    if(!snapshotPair?.afterSnapshotId||!branchId||!headHash||!base)return;
    setError('');setComparison(null);
    try{
      const response=await fetch(base+'/compare',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          branchId,expectedHeadHash:headHash,
          fromSnapshotId:snapshotPair.beforeSnapshotId,
          toSnapshotId:snapshotPair.afterSnapshotId,
        }),
      });
      const body=await response.json() as Diff & {summary?:string};
      if(!response.ok)throw new Error(body.summary??'Snapshot comparison failed');
      setComparison(body);
    }catch(err){setError(err instanceof Error?err.message:'Comparison failed');}
  }
  return <section className="hotel-worldline-v2" data-testid="hotel-worldline"
    aria-label="Persistent lifecycle history">
    <div className="hotel-worldline-v2-head">
      <div><GitBranch size={19}/><span><strong>Worldline</strong>
        <small>REPRODUCIBLE PROJECT HISTORY</small></span></div>
      <div className="hotel-worldline-v2-actions">
        {snapshotPair&&<button type="button" onClick={()=>void compare()}
          disabled={!snapshotPair.afterSnapshotId} data-testid="hotel-compare-revisions">
          <GitCompareArrows size={13}/> Compare accepted change
        </button>}
        <span>{headHash?.slice(0,10)??'—'} / CURRENT HEAD</span>
      </div>
    </div>
    <div className="hotel-worldline-v2-grid">
      <div className="hotel-worldline-tracks">
        {TRACKS.map(track=>{
          const events=data?.entries.filter(e=>e.track===track)??[];
          return <div key={track} className={'hotel-worldline-track '+(selectedTrack===track?'is-selected':'')}>
            <button type="button" onClick={()=>setSelectedTrack(track)}>{track.toUpperCase()}</button>
            <div className="hotel-worldline-track-flow"
              style={{borderColor:COLORS[track]}}>
              {events.length?events.map((event,i)=><button key={event.eventId}
                type="button" title={event.description} aria-label={event.description}
                onClick={()=>{setSelectedId(event.eventId);setSelectedTrack(track);}}
                className={selectedId===event.eventId?'is-active':''}
                style={{borderColor:COLORS[track],background:COLORS[track]}}>
                <span>{i+1}</span>
              </button>):<span className="hotel-worldline-no-data">No recorded {track} evidence</span>}
            </div>
          </div>;
        })}
      </div>
      <div className="hotel-worldline-selected">
        <div><History size={14}/> {selected?.command??(trackEntries.length?
          trackEntries[trackEntries.length-1]?.command:'SELECT A REVISION')}</div>
        <strong>{selected?.description??'Trace design decisions across physical reality and time'}</strong>
        <small>{selected?.timestamp??'Only verified VersionStore events are shown'}</small>
        {selected&&<span className="hotel-worldline-commit">
          <GitCommitHorizontal size={12}/>{selected.beforeHash.slice(0,7)} → {selected.afterHash.slice(0,7)}
        </span>}
        {comparison&&<div className="hotel-worldline-diff" data-testid="hotel-worldline-diff">
          <strong>SNAPSHOT COMPARISON</strong>
          <span>{comparison.changedIds.length} modified · {comparison.addedIds.length} added · {comparison.removedIds.length} removed</span>
          <small>Semantic objects only · native geometry differences not yet calculated</small>
        </div>}
        {error&&<p role="alert"><ShieldAlert size={12}/>{error}</p>}
      </div>
    </div>
  </section>;
}
