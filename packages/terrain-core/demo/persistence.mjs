export function createPersistenceClient({fetcher=(...args)=>fetch(...args), storage=sessionStorage}={}) {
  const key='plasma-terrain-pending-v1',draftKey='plasma-terrain-draft-v1',historyKey='plasma-terrain-draft-history-v1'; let token;
  const pending=()=>JSON.parse(storage.getItem(key)??'null');
  const history=()=>JSON.parse(storage.getItem(historyKey)??'null');
  const writeDraft=request=>{if(request)storage.setItem(draftKey,JSON.stringify(request));else storage.removeItem(draftKey);};
  async function call(url,options={}) {
    const response=await fetcher(url,options);
    const result=await response.json();
    if(!response.ok){const error=Error(result.error??'Saved terrain unavailable');error.status=response.status;error.conflicts=result.conflicts;throw error;}
    return result;
  }
  async function post(url,options={}) {
    const send=()=>call(url,{...options,method:'POST',headers:{...options.headers,'X-Plasma-Token':token}});
    try{return await send();}
    catch(error){
      if(error.status!==403)throw error;
      // The loopback server issues a new token after restart. Refresh credentials
      // only: never replace the user's preview or rebase the pending request.
      token=(await call('/api/world')).token;
      return send(); // One retry; persistent denial remains an error.
    }
  }
  const snapshot=data=>({branchId:data.branch,worldRevision:data.revision,proposalRevision:null,terrain:data.state.terrain});
  return {
    pending,
    draft(){return JSON.parse(storage.getItem(draftKey)??'null');},
    history,
    keepDraft(request,baseRevision){
      let h=history();const base=request?.baseWorldRevision??baseRevision;
      if(!h||h.baseRevision!==base){
        const previous=JSON.parse(storage.getItem(draftKey)??'null');
        h={baseRevision:base,entries:[null],index:0};
        if(previous?.baseWorldRevision===base){h.entries.push(previous);h.index=1;}
      }
      if(JSON.stringify(h.entries[h.index]?.operations??null)!==JSON.stringify(request?.operations??null)){
        h.entries=h.entries.slice(0,h.index+1);h.entries.push(request);h.index++;
      }
      storage.setItem(historyKey,JSON.stringify(h));writeDraft(request);
    },
    moveHistory(index){
      const h=history();if(!h||!Number.isInteger(index)||index<0||index>=h.entries.length)throw Error('Draft history unavailable');
      h.index=index;storage.setItem(historyKey,JSON.stringify(h));writeDraft(h.entries[index]);
    },
    discard(){storage.removeItem(key);storage.removeItem(draftKey);},
    async rebase(){
      const request=pending();if(!request)throw Error('No pending edit to reapply');
      return post('/api/rebase-preview',{headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
    },
    replacePending(previous,next){
      if(JSON.stringify(pending())!==JSON.stringify(previous))throw Error('Pending edit changed');
      storage.setItem(key,JSON.stringify(next));
      storage.removeItem(historyKey);
    },
    async backup(){return post('/api/backup');},
    async undo(baseRevision){return (await call('/api/undo-preview?base='+encodeURIComponent(baseRevision))).request;},
    async history(before=null){return call('/api/history'+(before===null?'':'?before='+encodeURIComponent(before)));},
    async restore(baseRevision,revision){return (await call('/api/restore-preview?base='+encodeURIComponent(baseRevision)+'&revision='+encodeURIComponent(revision))).request;},
    async load(){
      let data=await call('/api/world');token=data.token;
      const request=pending();
      if(request){
        const result=await call('/api/receipt?id='+encodeURIComponent(request.requestId));
        if(result.receipt){
          // Publication can occur between the initial snapshot and receipt lookup.
          data=await call('/api/world');token=data.token;
          if(data.snapshot.revision<result.receipt.worldRevision)throw Error('Saved revision has not reconciled');
          storage.removeItem(key);
          storage.removeItem(draftKey);
          storage.removeItem(historyKey);
        }
      }
      return snapshot(data.snapshot);
    },
    async save(request){
      const existing=pending();
      if(!existing)storage.setItem(key,JSON.stringify(request));
      const result=await post('/api/terrain',{headers:{'Content-Type':'application/json'},body:JSON.stringify(existing??request)});
      storage.removeItem(key);
      storage.removeItem(draftKey);
      storage.removeItem(historyKey);
      return snapshot(result.snapshot);
    }
  };
}
