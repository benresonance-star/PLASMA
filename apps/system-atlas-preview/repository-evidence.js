const CACHE_KEY='plasma-atlas-live-evidence-v1';
const CACHE_MS=120000;

function globToRegExp(glob){\n  const value=String(glob);\n  let out='^';\n  for(let i=0;i<value.length;i++){\n    const char=value[i];\n    if(char==='*'&&value[i+1]==='*'){\n      out+='.*';\n      i++;\n    }else if(char==='*'){\n      out+='[^/]*';\n    }else if(char==='?'){\n      out+='.';\n    }else if('\\.^$+()[]{}|'.includes(char)){\n      out+='\\\\'+char;\n    }else{\n      out+=char;\n    }\n  }\n  return new RegExp(out+'$');\n}\nfunction pathMatches(path,patterns=[]){
  return patterns.some(pattern=>globToRegExp(pattern).test(path));
}

function bindingPatterns(binding){
  const sourcePatterns=(binding.sources||[]).flatMap(source=>source.paths||[]);
  return [...new Set([
    ...sourcePatterns,
    'apps/system-atlas-preview/atlas.json',
    'apps/system-atlas-preview/repository-evidence.json'
  ])];
}

async function githubJson(url){
  const response=await fetch(url,{
    headers:{Accept:'application/vnd.github+json'},
    cache:'no-store'
  });
  if(!response.ok)throw new Error(\`GitHub evidence read failed: \${response.status} \${url}\`);
  return response.json();
}

function cacheRead(){
  try{
    const parsed=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(parsed&&Date.now()-parsed.cachedAt<CACHE_MS)return parsed.value;
  }catch{}
  return null;
}

function cacheWrite(value){
  try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({cachedAt:Date.now(),value}))}catch{}
}

function findJob(jobs,jobName){
  return (jobs||[]).find(job=>job.name===jobName)||(jobs||[])[0]||null;
}

function findStep(job,stepName){
  return (job?.steps||[]).find(step=>step.name===stepName)||null;
}

function observationFromRun({binding,run,job,step,headSha,stale=false,statusOverride=null}){
  const install=findStep(job,'Install');
  let status=statusOverride;
  if(!status){
    if(!step)status='linked';
    else if(step.status!=='completed')status=stale?'stale':'linked';
    else if(install&&install.conclusion!=='success')status=stale?'stale':'linked';
    else if(step.conclusion==='success')status=stale?'stale':'verified';
    else if(step.conclusion==='failure')status='failed';
    else status=stale?'stale':'linked';
  }
  return {
    status,
    method:binding.tests?.[0]?.framework||'ci',
    source:binding.tests?.flatMap(test=>test.paths||[]).join(', ')||null,
    subjectRevision:run?.head_sha||null,
    verifiedAt:run?.updated_at||run?.created_at||null,
    result:step?.conclusion||run?.conclusion||run?.status||null,
    repository:{
      provider:'github',
      headSha,
      testedCommitSha:run?.head_sha||null,
      workflow:binding.ci?.workflow||null,
      workflowRunId:run?.id||null,
      workflowUrl:run?.html_url||null,
      job:job?.name||binding.ci?.job||null,
      step:step?.name||binding.ci?.step||null,
      runStatus:run?.status||null,
      runConclusion:run?.conclusion||null
    }
  };
}

async function fetchJobs(repoBase,runs){
  const entries=await Promise.all((runs||[]).slice(0,6).map(async run=>{
    try{
      const jobs=await githubJson(\`\${repoBase}/actions/runs/\${run.id}/jobs?per_page=100\`);
      return [run.id,jobs.jobs||[]];
    }catch{
      return [run.id,[]];
    }
  }));
  return new Map(entries);
}

async function changedFiles(repoBase,baseSha,headSha,cache){
  if(!baseSha||!headSha||baseSha===headSha)return [];
  const key=\`\${baseSha}..\${headSha}\`;
  if(cache.has(key))return cache.get(key);
  try{
    const compare=await githubJson(\`\${repoBase}/compare/\${baseSha}...\${headSha}\`);
    const files=(compare.files||[]).map(file=>file.filename);
    cache.set(key,files);
    return files;
  }catch{
    cache.set(key,null);
    return null;
  }
}

export async function loadRepositoryEvidenceStatus(bindingsDoc){
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  if(local){
    return {
      mode:'offline',
      available:false,
      message:'Live repository evidence is disabled on the local smoke-test server.',
      headSha:null,
      updatedAt:new Date().toISOString(),
      bindings:bindingsDoc,
      observations:{}
    };
  }

  const cached=cacheRead();
  if(cached)return cached;

  const repo=bindingsDoc.repository;
  const repoBase=\`https://api.github.com/repos/\${repo.owner}/\${repo.name}\`;
  try{
    const [head,runsPayload]=await Promise.all([
      githubJson(\`\${repoBase}/commits/\${encodeURIComponent(repo.defaultBranch||'main')}\`),
      githubJson(\`\${repoBase}/actions/workflows/\${encodeURIComponent(bindingsDoc.workflow.file)}/runs?branch=\${encodeURIComponent(repo.defaultBranch||'main')}&event=push&per_page=12\`)
    ]);
    const headSha=head.sha;
    const runs=(runsPayload.workflow_runs||[]).filter(run=>run.head_branch===(repo.defaultBranch||'main'));
    const jobsByRun=await fetchJobs(repoBase,runs);
    const currentRun=runs.find(run=>run.head_sha===headSha)||null;
    const compareCache=new Map();
    const observations={};

    for(const binding of bindingsDoc.bindings||[]){
      if(!binding.ci||(binding.tests||[]).length===0){
        observations[binding.evidenceId]={
          status:'unlinked',
          method:'repository-binding',
          source:null,
          subjectRevision:null,
          verifiedAt:null,
          result:null,
          bindingId:binding.id,
          repository:{provider:'github',headSha,testedCommitSha:null,workflow:null,workflowRunId:null}
        };
        continue;
      }

      const currentJob=currentRun?findJob(jobsByRun.get(currentRun.id),binding.ci.job):null;
      const currentStep=currentJob?findStep(currentJob,binding.ci.step):null;
      if(currentRun&&currentStep?.status==='completed'){
        observations[binding.evidenceId]={
          ...observationFromRun({binding,run:currentRun,job:currentJob,step:currentStep,headSha}),
          bindingId:binding.id
        };
        continue;
      }

      let previous=null;
      for(const run of runs){
        if(run.head_sha===headSha)continue;
        const job=findJob(jobsByRun.get(run.id),binding.ci.job);
        const step=findStep(job,binding.ci.step);
        const install=findStep(job,'Install');
        if(step?.conclusion==='success'&&(!install||install.conclusion==='success')){
          previous={run,job,step};
          break;
        }
      }

      if(!previous){
        observations[binding.evidenceId]={
          status:'linked',
          method:binding.tests?.[0]?.framework||'ci',
          source:binding.tests?.flatMap(test=>test.paths||[]).join(', ')||null,
          subjectRevision:null,
          verifiedAt:null,
          result:currentRun?.status||null,
          bindingId:binding.id,
          repository:{provider:'github',headSha,testedCommitSha:null,workflow:binding.ci.workflow,workflowRunId:currentRun?.id||null}
        };
        continue;
      }

      const files=await changedFiles(repoBase,previous.run.head_sha,headSha,compareCache);
      const relevant=files===null?true:files.some(path=>pathMatches(path,bindingPatterns(binding)));
      observations[binding.evidenceId]={
        ...observationFromRun({
          binding,
          run:previous.run,
          job:previous.job,
          step:previous.step,
          headSha,
          stale:relevant
        }),
        bindingId:binding.id,
        staleReason:relevant?'Relevant source, evidence definition or binding changed since the last passing observation.':null
      };
    }

    const value={
      mode:'live',
      available:true,
      message:'Live evidence read from GitHub Actions for the current main branch.',
      headSha,
      updatedAt:new Date().toISOString(),
      bindings:bindingsDoc,
      observations
    };
    cacheWrite(value);
    return value;
  }catch(error){
    return {
      mode:'degraded',
      available:false,
      message:error instanceof Error?error.message:String(error),
      headSha:null,
      updatedAt:new Date().toISOString(),
      bindings:bindingsDoc,
      observations:{}
    };
  }
}

export async function loadRepositoryEvidenceBindings(){
  const response=await fetch('./repository-evidence.json',{cache:'no-store'});
  if(!response.ok)throw new Error(\`Repository evidence bindings failed to load: \${response.status}\`);
  return response.json();
}
);
}

function pathMatches(path,patterns=[]){
  return patterns.some(pattern=>globToRegExp(pattern).test(path));
}

function bindingPatterns(binding){
  const sourcePatterns=(binding.sources||[]).flatMap(source=>source.paths||[]);
  return [...new Set([
    ...sourcePatterns,
    'apps/system-atlas-preview/atlas.json',
    'apps/system-atlas-preview/repository-evidence.json'
  ])];
}

async function githubJson(url){
  const response=await fetch(url,{
    headers:{Accept:'application/vnd.github+json'},
    cache:'no-store'
  });
  if(!response.ok)throw new Error(\`GitHub evidence read failed: \${response.status} \${url}\`);
  return response.json();
}

function cacheRead(){
  try{
    const parsed=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(parsed&&Date.now()-parsed.cachedAt<CACHE_MS)return parsed.value;
  }catch{}
  return null;
}

function cacheWrite(value){
  try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({cachedAt:Date.now(),value}))}catch{}
}

function findJob(jobs,jobName){
  return (jobs||[]).find(job=>job.name===jobName)||(jobs||[])[0]||null;
}

function findStep(job,stepName){
  return (job?.steps||[]).find(step=>step.name===stepName)||null;
}

function observationFromRun({binding,run,job,step,headSha,stale=false,statusOverride=null}){
  const install=findStep(job,'Install');
  let status=statusOverride;
  if(!status){
    if(!step)status='linked';
    else if(step.status!=='completed')status=stale?'stale':'linked';
    else if(install&&install.conclusion!=='success')status=stale?'stale':'linked';
    else if(step.conclusion==='success')status=stale?'stale':'verified';
    else if(step.conclusion==='failure')status='failed';
    else status=stale?'stale':'linked';
  }
  return {
    status,
    method:binding.tests?.[0]?.framework||'ci',
    source:binding.tests?.flatMap(test=>test.paths||[]).join(', ')||null,
    subjectRevision:run?.head_sha||null,
    verifiedAt:run?.updated_at||run?.created_at||null,
    result:step?.conclusion||run?.conclusion||run?.status||null,
    repository:{
      provider:'github',
      headSha,
      testedCommitSha:run?.head_sha||null,
      workflow:binding.ci?.workflow||null,
      workflowRunId:run?.id||null,
      workflowUrl:run?.html_url||null,
      job:job?.name||binding.ci?.job||null,
      step:step?.name||binding.ci?.step||null,
      runStatus:run?.status||null,
      runConclusion:run?.conclusion||null
    }
  };
}

async function fetchJobs(repoBase,runs){
  const entries=await Promise.all((runs||[]).slice(0,6).map(async run=>{
    try{
      const jobs=await githubJson(\`\${repoBase}/actions/runs/\${run.id}/jobs?per_page=100\`);
      return [run.id,jobs.jobs||[]];
    }catch{
      return [run.id,[]];
    }
  }));
  return new Map(entries);
}

async function changedFiles(repoBase,baseSha,headSha,cache){
  if(!baseSha||!headSha||baseSha===headSha)return [];
  const key=\`\${baseSha}..\${headSha}\`;
  if(cache.has(key))return cache.get(key);
  try{
    const compare=await githubJson(\`\${repoBase}/compare/\${baseSha}...\${headSha}\`);
    const files=(compare.files||[]).map(file=>file.filename);
    cache.set(key,files);
    return files;
  }catch{
    cache.set(key,null);
    return null;
  }
}

export async function loadRepositoryEvidenceStatus(bindingsDoc){
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  if(local){
    return {
      mode:'offline',
      available:false,
      message:'Live repository evidence is disabled on the local smoke-test server.',
      headSha:null,
      updatedAt:new Date().toISOString(),
      bindings:bindingsDoc,
      observations:{}
    };
  }

  const cached=cacheRead();
  if(cached)return cached;

  const repo=bindingsDoc.repository;
  const repoBase=\`https://api.github.com/repos/\${repo.owner}/\${repo.name}\`;
  try{
    const [head,runsPayload]=await Promise.all([
      githubJson(\`\${repoBase}/commits/\${encodeURIComponent(repo.defaultBranch||'main')}\`),
      githubJson(\`\${repoBase}/actions/workflows/\${encodeURIComponent(bindingsDoc.workflow.file)}/runs?branch=\${encodeURIComponent(repo.defaultBranch||'main')}&event=push&per_page=12\`)
    ]);
    const headSha=head.sha;
    const runs=(runsPayload.workflow_runs||[]).filter(run=>run.head_branch===(repo.defaultBranch||'main'));
    const jobsByRun=await fetchJobs(repoBase,runs);
    const currentRun=runs.find(run=>run.head_sha===headSha)||null;
    const compareCache=new Map();
    const observations={};

    for(const binding of bindingsDoc.bindings||[]){
      if(!binding.ci||(binding.tests||[]).length===0){
        observations[binding.evidenceId]={
          status:'unlinked',
          method:'repository-binding',
          source:null,
          subjectRevision:null,
          verifiedAt:null,
          result:null,
          bindingId:binding.id,
          repository:{provider:'github',headSha,testedCommitSha:null,workflow:null,workflowRunId:null}
        };
        continue;
      }

      const currentJob=currentRun?findJob(jobsByRun.get(currentRun.id),binding.ci.job):null;
      const currentStep=currentJob?findStep(currentJob,binding.ci.step):null;
      if(currentRun&&currentStep?.status==='completed'){
        observations[binding.evidenceId]={
          ...observationFromRun({binding,run:currentRun,job:currentJob,step:currentStep,headSha}),
          bindingId:binding.id
        };
        continue;
      }

      let previous=null;
      for(const run of runs){
        if(run.head_sha===headSha)continue;
        const job=findJob(jobsByRun.get(run.id),binding.ci.job);
        const step=findStep(job,binding.ci.step);
        const install=findStep(job,'Install');
        if(step?.conclusion==='success'&&(!install||install.conclusion==='success')){
          previous={run,job,step};
          break;
        }
      }

      if(!previous){
        observations[binding.evidenceId]={
          status:'linked',
          method:binding.tests?.[0]?.framework||'ci',
          source:binding.tests?.flatMap(test=>test.paths||[]).join(', ')||null,
          subjectRevision:null,
          verifiedAt:null,
          result:currentRun?.status||null,
          bindingId:binding.id,
          repository:{provider:'github',headSha,testedCommitSha:null,workflow:binding.ci.workflow,workflowRunId:currentRun?.id||null}
        };
        continue;
      }

      const files=await changedFiles(repoBase,previous.run.head_sha,headSha,compareCache);
      const relevant=files===null?true:files.some(path=>pathMatches(path,bindingPatterns(binding)));
      observations[binding.evidenceId]={
        ...observationFromRun({
          binding,
          run:previous.run,
          job:previous.job,
          step:previous.step,
          headSha,
          stale:relevant
        }),
        bindingId:binding.id,
        staleReason:relevant?'Relevant source, evidence definition or binding changed since the last passing observation.':null
      };
    }

    const value={
      mode:'live',
      available:true,
      message:'Live evidence read from GitHub Actions for the current main branch.',
      headSha,
      updatedAt:new Date().toISOString(),
      bindings:bindingsDoc,
      observations
    };
    cacheWrite(value);
    return value;
  }catch(error){
    return {
      mode:'degraded',
      available:false,
      message:error instanceof Error?error.message:String(error),
      headSha:null,
      updatedAt:new Date().toISOString(),
      bindings:bindingsDoc,
      observations:{}
    };
  }
}

export async function loadRepositoryEvidenceBindings(){
  const response=await fetch('./repository-evidence.json',{cache:'no-store'});
  if(!response.ok)throw new Error(\`Repository evidence bindings failed to load: \${response.status}\`);
  return response.json();
}
