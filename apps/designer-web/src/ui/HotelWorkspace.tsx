import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import {
  ArrowLeft,ArrowRight,Box,Building2,Check,ChevronDown,Eye,FileText,
  FolderTree,GitBranch,GitCommitHorizontal,Layers,Link2,MapPin,
  Network,RefreshCw,Scan,ShieldAlert,SlidersHorizontal,
} from 'lucide-react';
import { ViewportCanvas } from './ViewportCanvas.js';
import { cadZUpMeshesToViewportYUp } from './northstar-coordinate.js';
import { apiBaseUrl } from '../api-client.js';
import type { DisplayMeshInput } from '../mesh-bridge.js';
import './hotel-workspace.css';

interface Room {
  readonly id:string;readonly level:number;readonly bay:number;
  readonly side:'north'|'south';readonly moduleId:string;
  readonly windowModuleId:string;
}
interface HotelManifest {
  readonly name:string;readonly keys:number;readonly storeys:number;
  readonly rooms:readonly Room[];readonly captureStatus:string;
  readonly projectStatus:string;
}
interface Module {
  readonly id:string;readonly name:string;readonly sourceHash:string;
  readonly revision:number;readonly partCount:number;
  readonly nativeVerified?:boolean;readonly sourceProjectId?:string;
}
interface Overview {
  readonly status:'linked-hotel-ready';
  readonly hotelId:string;readonly headHash:string;
  readonly manifest:HotelManifest;readonly modules:readonly Module[];
}
interface HotelScene {
  readonly status:'linked-hotel-scene';
  readonly kernel:'occt-native'|'exact-adapter';
  readonly nativeVerified:boolean;
  readonly headHash:string;readonly roomCount:number;readonly sceneObjectCount:number;
  readonly windowWidthMm:number;readonly compiledUniqueSolidCount:number;
  readonly meshes:readonly DisplayMeshInput[];
  readonly modules:readonly Module[];
  readonly manifest:HotelManifest;
  readonly drawings:{
    readonly planSvg:string;readonly sectionSvg:string;
    readonly planHash:string;readonly sectionHash:string;
    readonly issueStatus:'schematic-not-for-construction';
  };
  readonly unresolved:readonly string[];
}
interface HotelProps {
  readonly modelId:string|null;
  readonly branchId:string|null;
  readonly headHash:string|null;
  readonly onBack:()=>void;
  readonly onRevisionUpdated?:(result:{
    readonly headHash:string;readonly eventId:string;readonly action:string;
  })=>void;
  readonly sessionEvents:readonly {
    readonly id:string;readonly label:string;readonly kind:string;readonly atMs:number;
  }[];
}
function record(v:unknown):Record<string,unknown>|null{
  return v!==null&&typeof v==='object'&&!Array.isArray(v)
    ?v as Record<string,unknown>:null;
}
function compact(value:string):string{
  return value.length>22?value.slice(0,10)+'…'+value.slice(-7):value;
}
function roomName(room:Room):string{
  return 'L'+String(room.level).padStart(2,'0')+
    (room.side==='north'?'N':'S')+String(room.bay+1).padStart(2,'0');
}
function isQa():boolean{
  return typeof window!=='undefined'&&import.meta.env.DEV&&
    new URLSearchParams(window.location.search).get('northstar-qa')==='1'&&
    new URLSearchParams(window.location.search).get('stage')==='F13';
}
const MODULE_ORDER=['building-shell','suite-standard','suite-accessible',
  'suite-corner','window-a4'] as const;
function moduleTag(id:string):string{return id.split(':').pop()??id;}
function groupName(module:Module):string{
  const role=moduleTag(module.id);
  return role==='building-shell'?'BUILDING / ENVELOPE':
    role==='window-a4'?'SYSTEM / A4':
    role==='suite-standard'?'SUITE / STANDARD':
    role==='suite-accessible'?'SUITE / ACCESSIBLE':'SUITE / CORNER';
}
function msg(payload:unknown,otherwise:string):string{
  const value=record(payload);
  return String(value?.['summary']??value?.['failureCode']??otherwise);
}
async function apiJson<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,init);
  const body:unknown=await response.json();
  if(!response.ok)throw new Error(msg(body,'Request rejected ('+response.status+')'));
  return body as T;
}
function svgUrl(source:string):string{
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);
}
const WINDOW_HEIGHT=1850;
export function HotelWorkspace({
  modelId,branchId,headHash,onBack,onRevisionUpdated,sessionEvents,
}:HotelProps){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [scene,setScene]=useState<HotelScene|null>(null);
  const [level,setLevel]=useState(7);
  const [mode,setMode]=useState<'exterior'|'floor'>('exterior');
  const [busy,setBusy]=useState(false);
  const [sceneBusy,setSceneBusy]=useState(false);
  const [error,setError]=useState('');
  const [sceneError,setSceneError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedRoomId,setSelectedRoomId]=useState('entity:hotel:riverside-168:L07N12');
  const [activeModule,setActiveModule]=useState('entity:hotel:loft:window-a4');
  const [windowDraft,setWindowDraft]=useState('1800');
  const [candidate,setCandidate]=useState<number|null>(null);
  const [drawing,setDrawing]=useState<'plan'|'section'>('plan');
  const [sheetExpanded,setSheetExpanded]=useState(false);
  const [openEvidence,setOpenEvidence]=useState(false);
  const [worldlineFocus,setWorldlineFocus]=useState('design');
  const bootstrapAttempt=useRef(false);
  const nativeQaAttempt=useRef(false);
  const loadToken=useRef(0);
  const currentHead=useRef(headHash);
  currentHead.current=headHash;
  const base=modelId?apiBaseUrl()+'/models/'+encodeURIComponent(modelId)+'/hotels':'';
  const selectedRoom=scene?.manifest.rooms.find(room=>room.id===selectedRoomId)??null;
  const moduleInfo=scene?.modules.find(module=>module.id===activeModule)??null;
  const windowModule=scene?.modules.find(module=>moduleTag(module.id)==='window-a4');
  const isValidWidth=windowDraft.trim()!==''&&Number.isFinite(Number(windowDraft))&&
    Number(windowDraft)>=1200&&Number(windowDraft)<=2500;
  const displayMeshes=useMemo(()=>cadZUpMeshesToViewportYUp(scene?.meshes??[]),[scene]);
  const events=useMemo(()=>sessionEvents.slice().sort((a,b)=>a.atMs-b.atMs).slice(-10),[sessionEvents]);
  const modulesSorted=useMemo(()=>(scene?.modules??overview?.modules??[]).slice().sort(
    (a,b)=>MODULE_ORDER.indexOf(moduleTag(a.id) as typeof MODULE_ORDER[number])-
      MODULE_ORDER.indexOf(moduleTag(b.id) as typeof MODULE_ORDER[number])),[scene,overview]);

  const loadScene=useCallback(async (revision:string,kernel:'exact-adapter'|'occt-native',
    nextLevel:number,nextMode:'exterior'|'floor')=>{
    if(!base||!branchId)return;
    const token=++loadToken.current;
    setSceneBusy(true);setSceneError('');
    try{
      const result=await apiJson<HotelScene>(base+'/riverside/scene',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          branchId,expectedHeadHash:revision,
          selectedLevel:nextLevel,mode:nextMode,kernel,
        }),
      });
      if(token!==loadToken.current)return;
      setScene(result);
      setWindowDraft(String(result.windowWidthMm));
    }catch(err){
      if(token!==loadToken.current)return;
      setSceneError(err instanceof Error?err.message:'Scene could not be built');
      if(kernel==='occt-native'){
        // Do not claim native success or silently replace the last known scene.
        setNotice('Native qualification unavailable; previously verified source-derived display remains.');
      }
    }finally{if(token===loadToken.current)setSceneBusy(false);}
  },[base,branchId]);

  useEffect(()=>{
    if(!modelId||!branchId||!headHash)return;
    let active=true;
    void (async()=>{
      try{
        const existing=await apiJson<Overview>(base+'/riverside?branchId='+encodeURIComponent(branchId));
        if(!active)return;
        setOverview(existing);
        if(!scene || scene.headHash!==existing.headHash)
          await loadScene(existing.headHash,'exact-adapter',level,mode);
      }catch(e){
        if(!active)return;
        const message=e instanceof Error?e.message:'Project loading failed';
        if(message.includes('HOTEL_PROJECT_NOT_FOUND')){
          setOverview(null);setScene(null);
          if(isQa()&&!bootstrapAttempt.current){
            bootstrapAttempt.current=true;
            void beginHotel();
          }
        }else setError(message);
      }
    })();
    return()=>{active=false;};
    // A stable parent head triggers an authoritative source refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[modelId,branchId,headHash]);

  useEffect(()=>{
    if(!isQa()||nativeQaAttempt.current||!scene||scene.kernel==='occt-native'
      ||sceneBusy||!headHash||scene.headHash!==headHash)return;
    nativeQaAttempt.current=true;
    void loadScene(headHash,'occt-native',level,mode);
  },[scene,sceneBusy,headHash,level,mode,loadScene]);

  async function beginHotel(){
    if(!modelId||!branchId||!headHash)return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await apiJson<{
        headHash:string;eventId:string;keys:number;moduleCount:number;
      }>(base+'/bootstrap',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({branchId,expectedHeadHash:headHash}),
      });
      onRevisionUpdated?.({
        headHash:result.headHash,eventId:result.eventId,
        action:'Created linked 168-key hotel · '+result.moduleCount+' Loft subprojects',
      });
      const loaded=await apiJson<Overview>(base+'/riverside?branchId='+encodeURIComponent(branchId));
      setOverview(loaded);
      setNotice('Parent hotel and five Loft module projects created in one versioned event.');
      await loadScene(result.headHash,'exact-adapter',level,mode);
    }catch(err){setError(err instanceof Error?err.message:'Bootstrap rejected');}
    finally{setBusy(false);}
  }
  function changeView(nextLevel:number,nextMode:'exterior'|'floor'){
    setLevel(nextLevel);setMode(nextMode);
    if(scene&&branchId)void loadScene(scene.headHash,scene.kernel,nextLevel,nextMode);
  }
  function reviewChange(){
    setCandidate(null);setError('');
    if(!scene||!isValidWidth)return;
    const target=Number(windowDraft);
    if(target===scene.windowWidthMm){setError('Choose a different window width.');return;}
    setCandidate(target);
    setNotice('Linked change is a proposal. Nothing in the version store has changed.');
  }
  async function acceptChange(){
    if(!modelId||!branchId||!scene||candidate===null)return;
    setBusy(true);setError('');
    try{
      const update=await apiJson<{
        headHash:string;eventId:string;oldWidthMm:number;newWidthMm:number;
        affectedRoomCount:number;revisedModuleIds:readonly string[];
      }>(base+'/riverside/revise-window',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          branchId,expectedHeadHash:scene.headHash,
          nextWidthMm:candidate,
        }),
      });
      setCandidate(null);
      setNotice('Accepted one atomic source revision: '+update.affectedRoomCount+
        ' room windows, '+update.revisedModuleIds.length+
        ' Loft subprojects. Plans and sections regenerate from the new dimensions.');
      onRevisionUpdated?.({
        headHash:update.headHash,eventId:update.eventId,
        action:'A4 window '+update.oldWidthMm+' → '+update.newWidthMm+
          ' mm · 168 suites updated',
      });
      const newOverview=await apiJson<Overview>(
        base+'/riverside?branchId='+encodeURIComponent(branchId));
      setOverview(newOverview);
      await loadScene(update.headHash,scene.kernel,level,mode);
    }catch(e){setError(e instanceof Error?e.message:'Source acceptance rejected');}
    finally{setBusy(false);}
  }
  function pickRoom(id:string){
    setSelectedRoomId(id);
    const room=scene?.manifest.rooms.find(item=>item.id===id);
    if(room)setActiveModule(room.moduleId);
  }
  const sectionIsSelected=drawing==='section';
  const activeDrawing=sectionIsSelected?scene?.drawings.sectionSvg:scene?.drawings.planSvg;
  if(!modelId||!branchId||!headHash)return <div className="hotel-empty">
    <h2><Building2 size={26}/> Riverside Hotel</h2>
    <p>Open or create a versioned Plasma model to link modular Loft sub-projects.</p>
    <button onClick={onBack} type="button"><ArrowLeft size={15}/> Return to Plasma</button>
  </div>;

  return <section className="hotel-workspace" aria-label="Riverside Hotel linked Loft project" data-testid="hotel-workspace">
    <header className="hotel-topbar">
      <div className="hotel-brand"><span className="hotel-mark"><Layers size={19}/></span>
        <div><strong>PLASMA</strong><small>NORTHSTAR / MODULAR HOTEL</small></div></div>
      <div className="hotel-project-heading">
        <div className="hotel-project-icon"><Building2 size={22}/></div>
        <div><strong>Riverside Hotel</strong>
          <span>Design study / 8 storeys / 168 keys / linked Loft sub-projects</span></div>
      </div>
      <div className="hotel-top-status">
        <span className={'hotel-kernel '+(scene?.nativeVerified?'is-native':'')}>
          {scene?.nativeVerified?<Check size={13}/>:<ShieldAlert size={13}/>}
          {scene?.nativeVerified?'OCCT NATIVE VERIFIED':'SOURCE GEOMETRY / NATIVE UNVERIFIED'}
        </span>
        <span className="hotel-revision">DESIGN / {compact(scene?.headHash??headHash)}</span>
      </div>
      <div className="hotel-header-actions">
        <button type="button" onClick={onBack}><ArrowLeft size={15}/> Back to Plasma</button>
      </div>
    </header>

    {error&&<div className="hotel-error" role="alert">{error}</div>}
    {notice&&<div className="hotel-notice" role="status">{notice}</div>}

    {!overview&&!scene?<div className="hotel-welcome">
      <div className="hotel-welcome-graphic"><Building2 size={74} strokeWidth={1}/></div>
      <span className="hotel-eyebrow">F13 / SOURCE-LINKED HOTEL WORKSPACE</span>
      <h2>An architectural building made from linked, editable Loft projects.</h2>
      <p>Create a real versioned Plasma parent project with five Loft source sub-projects,
        168 modular guestroom occurrences, a common building shell and an A4 façade/window system.</p>
      <button type="button" disabled={busy} onClick={()=>void beginHotel()}
        data-testid="hotel-create">
        {busy?'Creating linked source project…':'Create Riverside Hotel project'} <ArrowRight size={17}/>
      </button>
      <small>Demo geometry and synthetic site context. No survey, issued BIM, approvals or engineering certification.</small>
    </div>:<div className="hotel-main">
      <aside className="hotel-pane hotel-place" aria-label="Reality layer and linked projects">
        <div className="hotel-pane-heading"><div><span className="hotel-index">01 / PLACE & SOURCES</span>
          <h3><MapPin size={16}/> Reality Layer</h3></div>
          <span className="hotel-dot-warning">UNREGISTERED</span></div>
        <div className="hotel-site">
          <div className="hotel-site-grid"/>
          <svg viewBox="0 0 330 194" aria-label="Schematic Riverside site outline, not registered or surveyed">
            <path d="M 0 146 L 330 63 M 14 0 L 142 194" stroke="#8d9a95" strokeWidth="17" opacity=".32"/>
            <rect x="87" y="30" width="176" height="119" rx="4" fill="#a8aaa0" stroke="#f2e5c9" strokeWidth="3"
              transform="rotate(-12 175 90)"/>
            <path d="M 121 45 L 242 20 L 266 136 L 144 160 Z" fill="#53625b" opacity=".8"/>
            <path d="M 142 51 L 244 30 L 263 125 L 160 149 Z" stroke="#e8b18c" strokeWidth="3" fill="none"
              strokeDasharray="6 4"/>
            <circle cx="241" cy="45" r="5" fill="#e6a579"/>
            <text x="24" y="178" fill="#f2f0e9" fontSize="11" letterSpacing="1">CONCEPT SITE / LOCAL XY ONLY</text>
          </svg>
          <span className="hotel-site-pin"><MapPin size={12}/> HOTEL / SYNTHETIC</span>
        </div>
        <div className="hotel-site-status"><ShieldAlert size={15}/>
          <span>No surveyed georeference or captured site reality. Design coordinates are local millimetres.</span></div>

        <div className="hotel-section-title"><FolderTree size={14}/> Linked source projects
          <strong>{modulesSorted.length}</strong></div>
        <div className="hotel-library" data-testid="hotel-module-library">
          {modulesSorted.map(module=><button type="button" key={module.id}
            className={'hotel-library-item '+(activeModule===module.id?'is-selected':'')}
            onClick={()=>setActiveModule(module.id)}>
            <Box size={15}/><span><strong>{module.name}</strong>
              <small>{groupName(module)} · {module.partCount} Loft solids</small></span>
            <span className="hotel-rev-chip">r{module.revision}</span>
          </button>)}
        </div>
        <div className="hotel-library-info">
          <strong>SUB-PROJECT LINK</strong>
          <span>{moduleInfo?.sourceProjectId??activeModule.split(':').pop()}</span>
          <code>{compact(moduleInfo?.sourceHash??'source pending')}</code>
          <small>Resolved from the current Plasma branch head · change-propagating source reference</small>
        </div>
      </aside>

      <main className="hotel-pane hotel-design" aria-label="Hotel architectural design">
        <div className="hotel-pane-heading hotel-design-title">
          <div><span className="hotel-index">02 / DESIGN</span>
            <h3><Building2 size={17}/> Model <span className="hotel-title-sub">/ modular architecture</span></h3></div>
          <span className="hotel-scene-count">{scene?scene.sceneObjectCount+' DRAWABLE GROUPS':'SCENE PENDING'}</span>
        </div>
        <div className="hotel-design-tabs">
          <div className="hotel-view-tabs">
            <button type="button" className={mode==='exterior'?'is-active':''}
              onClick={()=>changeView(level,'exterior')}><Eye size={14}/> Exterior</button>
            <button type="button" className={mode==='floor'?'is-active':''}
              onClick={()=>changeView(level,'floor')}><Layers size={14}/> Floor + interiors</button>
          </div>
          <div className="hotel-level-select">
            <label htmlFor="hotel-level">Level</label>
            <select id="hotel-level" value={level} onChange={e=>changeView(Number(e.target.value),mode)}>
              {Array.from({length:7},(_,i)=>i+1).reverse().map(n=>
                <option key={n} value={n}>L{String(n).padStart(2,'0')} · 24 suites</option>)}
            </select><ChevronDown size={12}/>
          </div>
        </div>
        <div className="hotel-viewport" data-testid="hotel-viewport">
          {scene?<ViewportCanvas
            meshes={[]}
            geometryServiceMeshes={displayMeshes}
            selectedSemanticId={selectedRoomId}
            onPickSemantic={pickRoom}
            autoFitOnGeometryChange
            focusServiceGeometry
            backgroundHex="#27353a"
            chrome="candidate"
          />:<div className="hotel-loading-scene"><RefreshCw size={25}/>
              Generating source-linked geometric scene…</div>}
          <div className="hotel-viewport-brand"><span>PL / B-REP STUDY</span><strong>RIVERSIDE / 168</strong></div>
          <div className="hotel-viewport-overlays">
            <span><span className="hotel-green-dot"/> 5 LINKED LOFT PROJECTS</span>
            <span>{scene?.nativeVerified?'TRUE OCCT SOURCE SOLIDS':'EXACT-ADAPTER SOURCE STUDY'}</span>
          </div>
          {sceneBusy&&<div className="hotel-viewport-progress">Regenerating geometry…</div>}
          <div className="hotel-selected-float">
            <span>SELECTED / ROOM OCCURRENCE</span>
            <strong>{selectedRoom?roomName(selectedRoom):'Select a suite'}</strong>
            <small>{selectedRoom?.moduleId.split(':').pop()??'Loft module'} · source linked</small>
          </div>
        </div>
        <div className="hotel-model-toolbar">
          <div><span className="hotel-mini-label">MODEL COMPILER</span>
            <strong>{scene?.compiledUniqueSolidCount??'—'} unique exact solids · {scene?.roomCount??168} suite occurrences</strong></div>
          <button type="button" disabled={sceneBusy||!scene}
            data-testid="hotel-native-button"
            onClick={()=>void loadScene(scene!.headHash,'occt-native',level,mode)}>
            <RefreshCw size={13}/> {sceneBusy?'Compiling…':'Verify native OpenCascade'}
          </button>
        </div>
        {sceneError&&<p className="hotel-scene-error" role="alert">{sceneError}</p>}
        <div className="hotel-document-strip">
          <button className={'hotel-drawing-card '+(drawing==='plan'?'selected':'')}
            onClick={()=>{setDrawing('plan');setSheetExpanded(true);}} type="button">
            <span className="hotel-doc-heading"><FileText size={14}/> PLAN / L{String(level).padStart(2,'0')}
              <small>SCHEMATIC</small></span>
            {scene&&<img src={svgUrl(scene.drawings.planSvg)} alt={'Linked room plan for level '+level}/>}
          </button>
          <button className={'hotel-drawing-card '+(drawing==='section'?'selected':'')}
            onClick={()=>{setDrawing('section');setSheetExpanded(true);}} type="button">
            <span className="hotel-doc-heading"><Scan size={14}/> SECTION / HOTEL
              <small>SCHEMATIC</small></span>
            {scene&&<img src={svgUrl(scene.drawings.sectionSvg)} alt="Source-linked schematic building section"/>}
          </button>
        </div>
        {sheetExpanded&&scene&&activeDrawing&&
          <div className="hotel-sheet-modal" role="dialog" aria-label="Linked source schematic drawing">
            <div><strong>LINKED DOCUMENT STUDY / {drawing.toUpperCase()}</strong>
              <button onClick={()=>setSheetExpanded(false)} type="button">Close</button></div>
            <img src={svgUrl(activeDrawing)} alt="Source-derived schematic drawing, not for construction"/>
            <small>Regenerates with the hotel module sources. This is not an issued architectural drawing.</small>
          </div>}
      </main>

      <aside className="hotel-pane hotel-reason" aria-label="Hotel causal reasoning and module editor">
        <div className="hotel-pane-heading"><div><span className="hotel-index">03 / REASON</span>
          <h3><Network size={17}/> Intent & Changes</h3></div>
          <span className="hotel-dot-neutral">GOVERNED</span></div>
        <div className="hotel-reason-content">
          <div className="hotel-intent">
            <span>DESIGN INTENT / RIVERSIDE</span>
            <strong>Modular guest suites with source-linked envelope and façade systems.</strong>
            <p>Change one design parameter and propagate to every room occurrence, module source and schematic drawing.</p>
          </div>
          <div className="hotel-trace">
            <div className="hotel-section-title"><Network size={14}/> Causal link / A4 window</div>
            <div className="hotel-trace-inputs">
              <span>Suite geometry</span><span>Window A4</span><span>Hotel shell</span>
            </div>
            <div className="hotel-trace-arrow"><ArrowRight size={17}/></div>
            <div className="hotel-trace-center"><Box size={17}/> 168 window occurrences</div>
            <div className="hotel-trace-arrow"><ArrowRight size={17}/></div>
            <div className="hotel-trace-outputs">
              <span>Façade model</span><span>Room plan</span><span>Section study</span>
            </div>
          </div>
          <div className="hotel-editor">
            <div className="hotel-section-title"><SlidersHorizontal size={14}/> Parametric change / sub-project
              <strong>F13</strong></div>
            <label htmlFor="hotel-window-width">A4 window width · mm</label>
            <div className="hotel-width-row">
              <input id="hotel-window-width" type="number" min="1200" max="2500" step="50"
                value={windowDraft} onChange={e=>{setWindowDraft(e.target.value);setCandidate(null);}}
                data-testid="hotel-window-width"/>
              <span>H {WINDOW_HEIGHT} mm</span>
            </div>
            <div className="hotel-change-facts">
              <span>Shared Loft source <strong>r{windowModule?.revision??0}</strong></span>
              <span>Affected suites <strong>168</strong></span>
              <span>Linked variants <strong>3</strong></span>
            </div>
            <button type="button" className="hotel-review-button"
              disabled={busy||!scene||!isValidWidth}
              onClick={reviewChange} data-testid="hotel-review-change">
              Review linked change <ArrowRight size={14}/>
            </button>
            {candidate!==null&&scene&&<div className="hotel-candidate" data-testid="hotel-change-proposal">
              <strong>PROPOSED / NOT COMMITTED</strong>
              <span>{scene.windowWidthMm} → {candidate} mm</span>
              <p>Update three suite opening definitions and one window source in a single Plasma version event.</p>
              <small>Change in nominal glass opening area across 168 rooms:
                {' '+(((candidate-scene.windowWidthMm)*WINDOW_HEIGHT*168)/1e6).toFixed(1)} m²</small>
              <div className="hotel-decision">
                <button type="button" onClick={()=>setCandidate(null)}>Discard</button>
                <button type="button" disabled={busy} onClick={()=>void acceptChange()}
                  data-testid="hotel-accept-change"><GitCommitHorizontal size={13}/> Accept revision</button>
              </div>
            </div>}
          </div>
          <div className="hotel-inspector">
            <div className="hotel-section-title"><Box size={14}/> Selected guest suite</div>
            <div className="hotel-inspector-heading">
              <strong>{selectedRoom?roomName(selectedRoom):'No selection'}</strong>
              <span>{selectedRoom?'Level '+selectedRoom.level+' · '+selectedRoom.side.toUpperCase():'—'}</span>
            </div>
            <div className="hotel-inspector-rows">
              <div><span>Loft suite</span><strong>{selectedRoom?.moduleId.split(':').pop()??'—'}</strong></div>
              <div><span>Façade system</span><strong>A4 / thermally broken study</strong></div>
              <div><span>Room grid</span><strong>3900 × 8100 mm</strong></div>
              <div><span>Window opening</span><strong>{scene?.windowWidthMm??'—'} × 1850 mm</strong></div>
            </div>
            <button type="button" className="hotel-select-corner" onClick={()=>{
              const corner=scene?.manifest.rooms.find(room=>room.level===level&&room.bay===11&&room.side==='north');
              if(corner)pickRoom(corner.id);
            }}>Inspect corner suite A4 <ArrowRight size={14}/></button>
          </div>
          <button type="button" className="hotel-evidence-toggle"
            onClick={()=>setOpenEvidence(!openEvidence)}>
            <ShieldAlert size={15}/> Evidence & unresolved gates
            <ChevronDown size={14}/>
          </button>
          {openEvidence&&<div className="hotel-evidence">
            {(scene?.unresolved??['Hotel source geometry is loading.']).map((issue,i)=>
              <p key={i}>{issue}</p>)}
          </div>}
        </div>
      </aside>
    </div>}

    {overview&&<footer className="hotel-worldline">
      <div className="hotel-worldline-label"><GitBranch size={18}/>
        <div><strong>Worldline</strong><small>VERSIONED MODEL EVENTS</small></div></div>
      <div className="hotel-phases">
        {['place','design','validate','construct','operate'].map(phase=>
          <button key={phase} type="button" className={worldlineFocus===phase?'selected':''}
            onClick={()=>setWorldlineFocus(phase)}>
            {phase.toUpperCase()}
          </button>)}
      </div>
      <div className="hotel-events" data-testid="hotel-worldline">
        {events.map(event=><div key={event.id} title={event.label}
          className="hotel-event"><span/><strong>{event.label}</strong>
          <small>{event.kind}</small></div>)}
        {!events.length&&<span className="hotel-event-empty">No recorded model events</span>}
      </div>
      <div className="hotel-head"><span>ACTIVE BRANCH HEAD</span>
        <strong>{compact(scene?.headHash??headHash)}</strong></div>
    </footer>}
    {isQa()&&<div className="hotel-qa-banner" data-testid="hotel-qa-banner">
      AUTOMATED VISUAL QA · SYNTHETIC HOTEL / NO SURVEY / NOT ISSUED BIM
    </div>}
  </section>;
}
