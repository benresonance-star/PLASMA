import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {openWorld} from '../src/store.mjs';
import {referenceDomains} from '../src/reference-domains.mjs';
import {demoTerrain} from '../../terrain-core/demo/fixture.mjs';
import {terrainUndoProposal,terrainRevisionProposal} from '../src/undo.mjs';
import {terrainRebaseProposal,terrainSnapshot} from '../src/rebase.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css'};
export async function createSavedDemo({filename=resolve(root,'.data/terrain-demo.sqlite'),port=8081}={}) {
  await mkdir(dirname(filename),{recursive:true});
  const wall=JSON.parse(await readFile(new URL('../../../docs/plasma/v0.5/reference-runtime/PLS-KERNEL-01_WALL_FIXTURE.json',import.meta.url),'utf8'));
  const world=openWorld({filename,initialState:{wall,terrain:demoTerrain},domains:referenceDomains,
    authorize:(actor,request)=>actor.id==='local-demo'&&request.domain==='terrain'?{terrainId:'terrain',allowedFeatureIds:demoTerrain.points.map(p=>p.id)}:null});
  const session=world.session({id:'local-demo'}),token=randomBytes(32).toString('hex');
  let origin;
  const json=(response,status,value)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));};
  const server=createServer(async(request,response)=>{
    try{
      if(request.headers.host!==new URL(origin).host)return json(response,403,{error:'Host denied'});
      const url=new URL(request.url,origin);
      if(url.pathname.startsWith('/api/')){
        if(request.headers.origin&&request.headers.origin!==origin)return json(response,403,{error:'Origin denied'});
        if(request.method==='GET'&&url.pathname==='/api/world')return json(response,200,{token,snapshot:world.snapshot()});
        if(request.method==='GET'&&url.pathname==='/api/receipt')return json(response,200,{receipt:session.getReceipt(url.searchParams.get('id'))});
        if(request.method==='GET'&&url.pathname==='/api/history'){
          const head=world.snapshot(),cursor=url.searchParams.get('before');
          if(cursor!==null&&(!/^\d+$/.test(cursor)||Number(cursor)>head.revision))return json(response,400,{error:'Invalid history cursor'});
          let revision=cursor===null?head.revision:Number(cursor);const entries=[];
          while(revision!==null&&entries.length<20){
            const saved=world.snapshot('main',revision);
            entries.push({revision:saved.revision,parent:saved.parent,intent:saved.event?.request?.payload?.intent??'Initial terrain',actor:saved.event?.actor?.id??null});
            revision=saved.parent;
          }
          return json(response,200,{head:head.revision,entries,nextRevision:revision});
        }
        if(request.method==='GET'&&url.pathname==='/api/restore-preview'){
          const current=world.snapshot(),base=url.searchParams.get('base'),target=url.searchParams.get('revision');
          if(!/^\d+$/.test(base??'')||Number(base)!==current.revision)return json(response,409,{error:'STALE_READ'});
          if(!/^\d+$/.test(target??'')||Number(target)>=current.revision)return json(response,400,{error:'Choose an earlier saved revision'});
          const proposal=terrainRevisionProposal(current,world.snapshot('main',Number(target)));
          session.preview({domain:'terrain',branch:'main',requestId:proposal.requestId,baseRevision:current.revision,payload:proposal});
          return json(response,200,{request:proposal});
        }
        if(request.method==='GET'&&url.pathname==='/api/undo-preview'){
          const current=world.snapshot(),base=url.searchParams.get('base');
          if(!/^\d+$/.test(base??'')||Number(base)!==current.revision)return json(response,409,{error:'STALE_READ'});
          if(current.parent===null)return json(response,422,{error:'No saved edit to undo'});
          const proposal=terrainUndoProposal(current,world.snapshot('main',current.parent));
          session.preview({domain:'terrain',branch:'main',requestId:proposal.requestId,baseRevision:current.revision,payload:proposal});
          return json(response,200,{request:proposal});
        }
        if(request.method!=='POST'||!['/api/terrain','/api/backup','/api/rebase-preview'].includes(url.pathname))return json(response,404,{error:'Unknown endpoint'});
        if(request.headers.origin!==origin||request.headers['x-plasma-token']!==token)return json(response,403,{error:'Save permission denied'});
        if(url.pathname==='/api/backup'){
          const folder=filename+'.backups';await mkdir(folder,{recursive:true});
          const name='recovery-'+randomUUID()+'.sqlite';
          return json(response,200,{...world.backup(resolve(folder,name)),name});
        }
        if(request.headers['content-type']!=='application/json')return json(response,415,{error:'JSON required'});
        const chunks=[];let size=0;
        for await(const chunk of request){size+=chunk.length;if(size>128*1024)return json(response,413,{error:'Request too large'});chunks.push(chunk);}
        const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(payload.branchId!=='main')return json(response,400,{error:'Main branch required'});
        if(url.pathname==='/api/rebase-preview'){
          if(!Number.isSafeInteger(payload.baseWorldRevision)||payload.baseWorldRevision<0)return json(response,400,{error:'Invalid base revision'});
          if(session.getReceipt(payload.requestId))return json(response,409,{error:'ALREADY_SAVED'});
          const current=world.snapshot(),base=world.snapshot('main',payload.baseWorldRevision);
          const proposal=terrainRebaseProposal(current,base,payload,{terrainId:'terrain',allowedFeatureIds:demoTerrain.points.map(p=>p.id)});
          session.preview({domain:'terrain',branch:'main',requestId:proposal.requestId,baseRevision:current.revision,payload:proposal});
          return json(response,200,{request:proposal,snapshot:terrainSnapshot(current)});
        }
        const receipt=session.submit({domain:'terrain',branch:'main',requestId:payload.requestId,baseRevision:payload.baseWorldRevision,payload});
        return json(response,200,{receipt,snapshot:world.snapshot()});
      }
      if(request.method!=='GET')return json(response,405,{error:'Method denied'});
      const pathname=decodeURIComponent(url.pathname);
      if(!['/packages/terrain-core/demo/','/packages/terrain-core/src/','/packages/interaction-reflex/src/'].some(prefix=>pathname.startsWith(prefix)))return json(response,404,{error:'Not found'});
      let file=resolve(root,'.'+pathname);const local=relative(root,file);
      if(local.startsWith('..')||isAbsolute(local)||local.split(/[\\/]/).some(p=>p.startsWith('.')))return json(response,403,{error:'Path denied'});
      if(!['packages/terrain-core/demo/','packages/terrain-core/src/','packages/interaction-reflex/src/'].some(prefix=>(local.replaceAll('\\','/')+'/').startsWith(prefix)))return json(response,403,{error:'Path denied'});
      if((await stat(file)).isDirectory())file=resolve(file,'index.html');
      if(!types[extname(file)])return json(response,404,{error:'Not found'});
      response.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(await readFile(file));
    }catch(error){
      const status=error.code==='ENOENT'?404:error instanceof SyntaxError?400:['STALE_READ','REQUEST_ID_REUSED'].includes(error.code)?409:422;
      json(response,status,{error:error.code??error.message,...(error.conflicts?{conflicts:error.conflicts}:{})});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  return {origin,close:async()=>{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));world.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createSavedDemo({filename:process.env.PLASMA_DEMO_DB,port:Number(process.env.PLASMA_DEMO_PORT??8081)});
  console.log('Saved Plasma demo: '+app.origin+'/packages/terrain-core/demo/?durable=1');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit());});
}
