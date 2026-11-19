export default async function handler(req,res){
 const upstream=process.env.LOFT_BACKEND_URL;
 const secret=process.env.LOFT_SERVICE_TOKEN;
 if(!upstream||!secret){res.status(503).json({ok:false,error:'Loft exact geometry service is not connected yet'});return;}
 const requested=String(req.query.path||'').replace(/^\/+/, '');
 if(!/^(cad|projects|model|plasma)(?:\/|$)/.test(requested) || requested.includes('..')){
  res.status(404).json({ok:false,error:'Unknown Loft API endpoint'});return;
 }
 if(!['GET','POST'].includes(req.method)){res.status(405).json({ok:false,error:'Method not permitted'});return;}
 const headers={'Accept':'application/json','X-Loft-Service-Key':secret};
 let body;
 if(req.method==='POST'){
  if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.status(415).json({ok:false,error:'JSON required'});return;}
  body=JSON.stringify(req.body);
  if(Buffer.byteLength(body||'')>5000000){res.status(413).json({ok:false,error:'Request too large'});return;}
  headers['Content-Type']='application/json';
 }
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),120000);
 try{
  const url=new URL('/api/'+requested,upstream);
  if(url.protocol!=='https:')throw Error('HTTPS backend required');
  const response=await fetch(url,{method:req.method,headers,body,signal:controller.signal,redirect:'error'});
  res.status(response.status);
  for(const h of ['content-type','content-disposition','x-cad-request-id','x-cad-step-reimport-valid']){
   const v=response.headers.get(h);if(v)res.setHeader(h,v);
  }
  res.setHeader('Cache-Control','no-store');
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.status(502).json({ok:false,error:'Protected CAD backend unavailable'});}
 finally{clearTimeout(timeout);}
}