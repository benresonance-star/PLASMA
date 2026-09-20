const esc = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

const labelize = value => String(value || '').replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());

function chips(items = [], cls = '') {
  return items.map(item => `<span class="chip ${cls}">${esc(item)}</span>`).join('');
}

function statusBadge(value, tone = '') {
  return `<span class="status-badge ${tone}">${esc(labelize(value))}</span>`;
}

function refButton(type, id, label, cls = 'ref-chip') {
  return `<button class="${cls}" type="button" data-atlas-type="${esc(type)}" data-atlas-id="${esc(id)}">${esc(label)}</button>`;
}

function componentCard(item, selected = false) {
  return `<button class="atlas-card component-card authority-${esc(item.authority)} ${selected ? 'selected' : ''}" type="button"
    data-atlas-type="component" data-atlas-id="${esc(item.id)}" data-overview-id="${esc(item.id)}">
    <div class="card-kicker">${esc(labelize(item.kind))}</div>
    <h3>${esc(item.name)}</h3>
    <p>${esc(item.summary)}</p>
    <div class="card-meta">${statusBadge(item.status)}<span>${esc(item.atlasId)}</span></div>
  </button>`;
}

function languageCard(item, type, selected = false) {
  const tokenSets = type === 'domainLanguage'
    ? `<div class="token-section"><b>Types</b><div>${chips(item.types,'type-token')}</div></div>
       <div class="token-section"><b>Verbs</b><div>${chips(item.verbs,'verb-token')}</div></div>
       <div class="token-section"><b>Constraints</b><div>${chips(item.constraints,'constraint-token')}</div></div>`
    : `<div class="language-verb">${esc(item.verb)}</div>`;
  return `<button class="atlas-card language-card ${selected ? 'selected' : ''}" type="button"
      data-atlas-type="${type}" data-atlas-id="${esc(item.id)}">
      <div class="card-kicker">${type === 'domainLanguage' ? 'Domain language' : 'Cross-cutting language'}</div>
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.summary)}</p>
      ${tokenSets}
    </button>`;
}

export function createRenderer({ model, viewHost, inspector, indexHost }) {
  let lastOverviewSelection = null;

  function renderIndex(route) {
    const c = model.by.component;
    const domain = model.data.languages.domain;
    const core = model.data.languages.crossCutting;
    const active = (type,id) => route.type === type && route.id === id ? 'active' : '';
    indexHost.innerHTML = `
      <div class="index-scroll">
        <div class="index-group">
          <div class="index-label">Plasma sections</div>
          <a class="index-item current-section" href="#overview"><span class="dot authority"></span>System Atlas</a>
          <a class="index-item external-link" href="https://benresonance-star.github.io/AI_DEV_OPS/#build" target="_blank" rel="noopener">
            <span class="dot runtime"></span>Build · AI Dev Ops <span class="external-mark">↗</span>
          </a>
        </div>
        <div class="index-group">
          <div class="index-label">Planes</div>
          ${['authority','interaction','intelligence'].map(id => {
            const x=c.get(id); return `<button class="index-item ${active('component',id)}" data-atlas-type="component" data-atlas-id="${id}"><span class="dot ${x.authority==='authoritative'?'authority':x.kind==='agentic'?'agent':'runtime'}"></span>${esc(x.name)}</button>`;
          }).join('')}
        </div>
        <div class="index-group">
          <div class="index-label">Execution + projection</div>
          ${['geometry','constraints','representation','external'].map(id => {
            const x=c.get(id); return `<button class="index-item ${active('component',id)}" data-atlas-type="component" data-atlas-id="${id}"><span class="dot ${x.authority==='external'?'external':x.authority==='derived'?'derived':'runtime'}"></span>${esc(x.name)}</button>`;
          }).join('')}
        </div>
        <div class="index-group">
          <div class="index-label">Domain languages</div>
          ${domain.map(x => `<button class="index-item ${active('domainLanguage',x.id)}" data-atlas-type="domainLanguage" data-atlas-id="${esc(x.id)}"><span class="dot language"></span>${esc(x.name)}</button>`).join('')}
        </div>
        <details class="index-group compact" ${route.type==='coreLanguage'?'open':''}>
          <summary class="index-label">Cross-cutting languages <span>${core.length}</span></summary>
          ${core.map(x => `<button class="index-item ${active('coreLanguage',x.id)}" data-atlas-type="coreLanguage" data-atlas-id="${esc(x.id)}"><span class="dot core"></span>${esc(x.name)}</button>`).join('')}
        </details>
      </div>
      <div class="index-legend">
        <span><i class="dot authority"></i>authoritative</span>
        <span><i class="dot runtime"></i>runtime</span>
        <span><i class="dot agent"></i>agentic</span>
        <span><i class="dot external"></i>external</span>
      </div>`;
  }

  function renderView(route, options = {}) {
    const view = route.view;
    if (view === 'languages') renderLanguages(route);
    else if (view === 'transactions') renderTransactions(route);
    else if (view === 'components') renderComponents(route);
    else if (view === 'contracts') renderContracts(route);
    else if (view === 'slices') renderSlices(route);
    else if (view === 'evidence') renderEvidence(route);
    else renderOverview(route, options);
    renderIndex(route);
  }

  function renderOverview(route, { showRelationships = true } = {}) {
    const selectedId = route.type === 'component' ? route.id : null;
    lastOverviewSelection = selectedId;
    const item = id => model.by.component.get(id);
    viewHost.innerHTML = `
      <div class="view-scroll">
        <section class="view-stage overview-stage" data-base-width="980">
          <div class="view-intro">
            <div><div class="eyebrow">System Atlas · live projection</div><h2>Authority hierarchy</h2>
            <p>Read top to bottom: intent proposes, authority owns truth, execution computes, projections and external systems remain non-authoritative.</p></div>
            <div class="principle">Proposal ≠ authority</div>
          </div>
          <div class="overview-graph" id="overviewGraph">
            <svg class="relationship-layer ${showRelationships?'':'hidden'}" id="relationshipLayer" aria-hidden="true"></svg>
            <div class="band-label band-intent-label">Intent</div>
            <div class="band-label band-authority-label">Authority</div>
            <div class="band-label band-execution-label">Execution</div>
            <div class="band-label band-projection-label">Derived / boundary</div>
            <div class="slot slot-interaction">${componentCard(item('interaction'),selectedId==='interaction')}</div>
            <div class="slot slot-intelligence">${componentCard(item('intelligence'),selectedId==='intelligence')}</div>
            <div class="slot slot-authority">${componentCard(item('authority'),selectedId==='authority')}</div>
            <div class="slot slot-geometry">${componentCard(item('geometry'),selectedId==='geometry')}</div>
            <div class="slot slot-constraints">${componentCard(item('constraints'),selectedId==='constraints')}</div>
            <div class="slot slot-representation">${componentCard(item('representation'),selectedId==='representation')}</div>
            <div class="slot slot-external">${componentCard(item('external'),selectedId==='external')}</div>
          </div>
          <section class="relationship-ledger">
            <div class="section-heading"><div><div class="eyebrow">Typed relationships</div><h3>Contracts crossing boundaries</h3></div><span>${model.data.relationships.length} relationships</span></div>
            <div class="relation-grid">
              ${model.data.relationships.map(rel => {
                const from=item(rel.from),to=item(rel.to);
                const active=route.type==='relationship'&&route.id===rel.id;
                return `<button class="relation-card ${active?'selected':''}" data-atlas-type="relationship" data-atlas-id="${esc(rel.id)}">
                  <div class="relation-route"><b>${esc(from.name)}</b><span>${rel.direction==='bidirectional'?'↔':'→'}</span><b>${esc(to.name)}</b></div>
                  <strong>${esc(rel.label)}</strong>
                  <span>${esc(rel.payload)}</span>
                  <small>${esc(rel.authoritySemantics)}</small>
                </button>`;
              }).join('')}
            </div>
          </section>
        </section>
      </div>`;
    requestAnimationFrame(() => drawRelationships(showRelationships, route));
  }

  function drawRelationships(showRelationships = true, route = {}) {
    const graph = viewHost.querySelector('#overviewGraph');
    const svg = viewHost.querySelector('#relationshipLayer');
    if (!graph || !svg || !showRelationships) return;
    const graphRect = graph.getBoundingClientRect();
    const scale = graphRect.width / (graph.offsetWidth || graphRect.width || 1);
    svg.setAttribute('viewBox', `0 0 ${graph.offsetWidth} ${graph.offsetHeight}`);
    svg.innerHTML = `<defs>
      <marker id="arrowBlue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow-blue"/></marker>
      <marker id="arrowAmber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow-amber"/></marker>
      <marker id="arrowGreen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow-green"/></marker>
    </defs>`;

    const point = (el, side, frac=.5) => {
      const r=el.getBoundingClientRect();
      const x=(r.left-graphRect.left)/scale, y=(r.top-graphRect.top)/scale, w=r.width/scale, h=r.height/scale;
      if(side==='top')return{x:x+w*frac,y};
      if(side==='left')return{x,y:y+h*frac};
      if(side==='right')return{x:x+w,y:y+h*frac};
      return{x:x+w*frac,y:y+h};
    };

    const ports={
      'rel-interaction-authority':['bottom',.68,'top',.32,-10],
      'rel-intelligence-authority':['bottom',.32,'top',.68,10],
      'rel-authority-geometry':['bottom',.28,'top',.5,-8],
      'rel-authority-constraints':['bottom',.72,'top',.5,8],
      'rel-authority-representation':['bottom',.22,'top',.5,-12],
      'rel-external-authority':['left',.45,'right',.82,34]
    };

    model.data.relationships.forEach((rel,index)=>{
      const a=graph.querySelector(`[data-overview-id="${rel.from}"]`);
      const b=graph.querySelector(`[data-overview-id="${rel.to}"]`);
      if(!a||!b)return;
      const p=ports[rel.id]||['bottom',.5,'top',.5,0];
      const p1=point(a,p[0],p[1]), p2=point(b,p[2],p[3]);
      let d;
      if(p[0]==='left'||p[0]==='right'){
        const outside=Math.max(p1.x,p2.x)+70+p[4];
        d=`M ${p1.x} ${p1.y} L ${outside} ${p1.y} L ${outside} ${p2.y} L ${p2.x} ${p2.y}`;
      }else{
        const mid=p1.y+(p2.y-p1.y)*.5+p[4];
        d=`M ${p1.x} ${p1.y} L ${p1.x} ${mid} L ${p2.x} ${mid} L ${p2.x} ${p2.y}`;
      }
      const tone=rel.from==='external'?'green':(rel.to==='geometry'||rel.to==='constraints')?'amber':'blue';
      const hot=route.type==='component' ? (route.id===rel.from||route.id===rel.to) : route.type==='relationship' ? route.id===rel.id : true;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',d);path.setAttribute('class',`rel-line ${tone} ${hot?'hot':'faded'}`);
      path.setAttribute('marker-end',`url(#arrow${tone[0].toUpperCase()+tone.slice(1)})`);
      if(rel.direction==='bidirectional')path.setAttribute('marker-start',`url(#arrow${tone[0].toUpperCase()+tone.slice(1)})`);
      svg.appendChild(path);
    });
  }

  function renderLanguages(route) {
    const domainSelected=route.type==='domainLanguage'?route.id:null;
    const coreSelected=route.type==='coreLanguage'?route.id:null;
    const lang=model.data.languages;
    viewHost.innerHTML=`
      <div class="view-scroll">
        <section class="view-stage language-stage" data-base-width="960">
          <div class="view-intro">
            <div><div class="eyebrow">Language architecture</div><h2>Small languages, shared semantics</h2>
            <p>Domain vocabularies express intent. Cross-cutting languages provide stable shared semantics. Neither owns authoritative state.</p></div>
            <div class="principle">Languages share semantics, not implementation</div>
          </div>

          <section class="atlas-section">
            <div class="section-heading"><div><div class="eyebrow">Band 1</div><h3>Domain languages</h3></div><span>Replaceable vocabularies</span></div>
            <div class="domain-language-grid">${lang.domain.map(x=>languageCard(x,'domainLanguage',domainSelected===x.id)).join('')}</div>
            <div class="future-row"><b>Future domains</b>${lang.futureDomains.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
          </section>

          <section class="atlas-section">
            <div class="section-heading"><div><div class="eyebrow">Band 2</div><h3>Cross-cutting languages</h3></div><span>Stable shared semantics</span></div>
            <div class="core-language-grid">${lang.crossCutting.map(x=>languageCard(x,'coreLanguage',coreSelected===x.id)).join('')}</div>
            <div class="two-column">
              <div class="info-card"><h4>Machine-readable language contract</h4><div class="contract-shape">${lang.contractShape.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>
              <div class="info-card"><h4>Operation levels</h4>${lang.operationLevels.map(x=>`<div class="level-row"><b>${esc(x.name)}</b><span>${esc(x.examples.join(' · '))}</span><small>${esc(x.description)}</small></div>`).join('')}</div>
            </div>
          </section>

          <section class="atlas-section interaction-rule">
            <div class="eyebrow">Interaction rule</div>
            <h3>Languages communicate through the world</h3>
            <p>${esc(lang.interactionRule)}</p>
          </section>
        </section>
      </div>`;
  }

  function renderTransactions(route) {
    const tx=model.data.transactions;
    const selected=route.type==='stage'?route.id:null;
    viewHost.innerHTML=`
      <div class="view-scroll">
        <section class="view-stage transaction-stage" data-base-width="1040">
          <div class="view-intro">
            <div><div class="eyebrow">Authority constitution</div><h2>Authoritative commit loop</h2>
            <p>${esc(tx.principle)} Computation may happen anywhere; reality changes only here.</p></div>
            <div class="principle">All or nothing</div>
          </div>

          <section class="atlas-section">
            <div class="section-heading"><div><div class="eyebrow">Lifecycle</div><h3>Proposal → truth → invalidation</h3></div><span>10 stages</span></div>
            <div class="transaction-flow">
              ${tx.stages.map(stage=>`<button class="transaction-step ${selected===stage.id?'selected':''}" data-atlas-type="stage" data-atlas-id="${esc(stage.id)}">
                <span class="step-number">${String(stage.step).padStart(2,'0')}</span><h4>${esc(stage.name)}</h4><p>${esc(stage.summary)}</p>
              </button>`).join('')}
            </div>
          </section>

          <section class="two-column transaction-detail-grid">
            <div class="atlas-section">
              <div class="section-heading"><div><div class="eyebrow">Core interchange object</div><h3>Candidate Patch</h3></div><span>proposal · not state</span></div>
              <p class="section-copy">${esc(tx.candidatePatch.explanation)}</p>
              <div class="field-grid">${tx.candidatePatch.fields.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
            </div>
            <div class="atlas-section">
              <div class="section-heading"><div><div class="eyebrow">Freshness</div><h3>Derived validity states</h3></div></div>
              <p class="section-copy">Invalidation and recomputation are deliberately separate. A stale result is visible as stale before any worker decides whether to recompute it.</p>
              <div class="freshness-row">${tx.freshnessStates.map(x=>statusBadge(x,x==='fresh'?'good':x==='stale'?'warn':'' )).join('')}</div>
            </div>
          </section>

          <section class="atlas-section">
            <div class="section-heading"><div><div class="eyebrow">Validation pipeline</div><h3>What must be true before commit?</h3></div><span>${tx.validation.length} gates</span></div>
            <div class="validation-grid">${tx.validation.map(v=>`<article><b>${esc(v.name)}</b><p>${esc(v.question)}</p></article>`).join('')}</div>
          </section>

          <section class="atlas-section">
            <div class="section-heading"><div><div class="eyebrow">Rejection is first-class</div><h3>Failure paths</h3></div><span>world remains unchanged</span></div>
            <div class="rejection-grid">${tx.rejectionPaths.map(r=>`<article><span>${esc(r.name)}</span><b>${esc(r.action)}</b><p>${esc(r.description)}</p></article>`).join('')}</div>
          </section>

          <section class="atlas-section">
            <div class="section-heading"><div><div class="eyebrow">Kernel invariants</div><h3>Non-negotiable authority rules</h3></div></div>
            <div class="invariant-grid">${tx.invariants.map((x,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><p>${esc(x)}</p></div>`).join('')}</div>
          </section>
        </section>
      </div>`;
  }

  function renderComponents(route) {
    const selected=route.type==='component'?route.id:null;
    const bands=[
      ['intent','Intent','Human and machine proposers'],
      ['authority','Authority','Canonical truth and transaction ownership'],
      ['execution','Execution','Non-authoritative computation and validation'],
      ['projection','Derived / boundary','Views and external integrations']
    ];
    viewHost.innerHTML=`
      <div class="view-scroll"><section class="view-stage catalogue-stage" data-base-width="940">
        <div class="view-intro"><div><div class="eyebrow">Component catalogue</div><h2>Systems by authority role</h2><p>Each component exposes purpose, ownership, contracts, dependencies and evidence requirements from the same Atlas model.</p></div></div>
        ${bands.map(([id,name,desc])=>`<section class="atlas-section"><div class="section-heading"><div><div class="eyebrow">${esc(name)}</div><h3>${esc(desc)}</h3></div></div><div class="catalogue-grid">${model.data.components.filter(x=>x.band===id).map(x=>componentCard(x,selected===x.id)).join('')}</div></section>`).join('')}
      </section></div>`;
  }

  function renderContracts(route) {
    const selected=route.type==='contract'?route.id:null;
    viewHost.innerHTML=`
      <div class="view-scroll"><section class="view-stage catalogue-stage" data-base-width="980">
        <div class="view-intro"><div><div class="eyebrow">Typed interfaces</div><h2>Contracts</h2><p>Contracts make authority crossings explicit: payload, direction, semantics and failure behavior are part of the architecture.</p></div><div class="principle">Interfaces over implementation</div></div>
        <div class="contract-list">${model.data.contracts.map(c=>`<button class="contract-card ${selected===c.id?'selected':''}" data-atlas-type="contract" data-atlas-id="${esc(c.id)}">
          <div class="contract-title"><div><span class="eyebrow">${esc(c.id)}</span><h3>${esc(c.name)}</h3></div><span class="route-pill">${esc(c.from)} → ${esc(c.to)}</span></div>
          <div class="contract-io"><div><b>Input</b><code>${esc(c.input)}</code></div><div><b>Output</b><code>${esc(c.output)}</code></div></div>
          <p>${esc(c.semantics)}</p><small>Failure: ${esc(c.failure)}</small>
        </button>`).join('')}</div>
      </section></div>`;
  }

  function evidenceCell(value) {
    const tone=value==='verified'?'good':value==='partial'||value==='declared'?'warn':'';
    return statusBadge(value,tone);
  }

  function renderSlices(route) {
    const selected=route.type==='slice'?route.id:null;
    viewHost.innerHTML=`
      <div class="view-scroll"><section class="view-stage catalogue-stage" data-base-width="980">
        <div class="view-intro"><div><div class="eyebrow">Vertical slices</div><h2>Capability evidence, not percentages</h2><p>The Atlas no longer invents implementation percentages. Each slice exposes declared state separately from linked verification evidence.</p></div><div class="principle warning">Evidence links pending</div></div>
        <div class="slice-catalogue">${model.data.slices.map(s=>`<button class="slice-card ${selected===s.id?'selected':''}" data-atlas-type="slice" data-atlas-id="${esc(s.id)}">
          <div class="slice-head"><div><span class="eyebrow">Vertical slice</span><h3>${esc(s.name)}</h3></div>${statusBadge(s.evidenceState,'warn')}</div>
          <p>${esc(s.summary)}</p>
          <div class="slice-checks">
            ${Object.entries(s.checks).map(([k,v])=>`<div><span>${esc(labelize(k))}</span>${evidenceCell(v)}</div>`).join('')}
          </div>
          <small>Declared state: ${esc(s.declaredState)}</small>
        </button>`).join('')}</div>
      </section></div>`;
  }

  function renderEvidence(route) {
    const selected=route.type==='evidence'?route.id:null;
    const linked=model.data.evidence.filter(x=>x.state==='linked'||x.state==='verified').length;
    viewHost.innerHTML=`
      <div class="view-scroll"><section class="view-stage catalogue-stage" data-base-width="960">
        <div class="view-intro"><div><div class="eyebrow">Evidence ledger</div><h2>What is trusted, and why?</h2><p>Evidence requirements are explicit. An unlinked requirement is shown as unknown rather than silently treated as verified.</p></div><div class="evidence-summary"><b>${linked}</b><span>linked of ${model.data.evidence.length}</span></div></div>
        <div class="evidence-list">${model.data.evidence.map(e=>`<button class="evidence-card ${selected===e.id?'selected':''}" data-atlas-type="evidence" data-atlas-id="${esc(e.id)}">
          <div><span class="eyebrow">${esc(labelize(e.kind))}</span><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p></div>
          <div class="evidence-side">${statusBadge(e.state,e.state==='verified'?'good':'warn')}<small>${esc(e.supports.join(' · '))}</small></div>
        </button>`).join('')}</div>
      </section></div>`;
  }

  function renderInspector(ref) {
    if (!ref) {
      inspector.innerHTML=`<div class="inspector-empty"><div class="eyebrow">Inspector</div><h2>Select an Atlas item</h2><p>Purpose, contracts, dependencies and evidence are derived from the machine-readable architecture model.</p></div>`;
      return;
    }
    const r=ref.raw;
    let body='';
    if(ref.type==='component'){
      const contractButtons=(r.contracts||[]).map(id=>{const c=model.by.contract.get(id);return c?refButton('contract',id,c.name):''}).join('');
      const depButtons=(r.dependencies||[]).map(id=>{const c=model.by.component.get(id);return c?refButton('component',id,c.name):''}).join('');
      const evButtons=(r.evidence||[]).map(id=>{const e=model.by.evidence.get(id);return e?refButton('evidence',id,e.name):''}).join('');
      const rels=model.data.relationships.filter(x=>x.from===r.id||x.to===r.id);
      body=`
        <div class="inspector-kv"><span>Authority</span><b>${esc(labelize(r.authority))}</b><span>Status</span><b>${esc(labelize(r.status))}</b><span>Owner</span><b>${esc(r.owner)}</b></div>
        <section><h4>Contracts</h4><div class="ref-list">${contractButtons||'<span class="muted">None declared</span>'}</div></section>
        <section><h4>Dependencies</h4><div class="ref-list">${depButtons||'<span class="muted">None declared</span>'}</div></section>
        <section><h4>Relationships</h4><div class="ref-list">${rels.map(x=>refButton('relationship',x.id,x.label)).join('')}</div></section>
        <section><h4>Evidence requirements</h4><div class="ref-list">${evButtons||'<span class="muted">None declared</span>'}</div></section>`;
    } else if(ref.type==='relationship'){
      const contract=model.by.contract.get(r.contract);
      body=`<div class="inspector-kv"><span>From</span><b>${esc(model.by.component.get(r.from)?.name||r.from)}</b><span>To</span><b>${esc(model.by.component.get(r.to)?.name||r.to)}</b><span>Payload</span><b>${esc(r.payload)}</b><span>Mode</span><b>${esc(r.mode)}</b><span>Authority</span><b>${esc(r.authoritySemantics)}</b></div>
        <section><h4>Contract</h4><div class="ref-list">${contract?refButton('contract',contract.id,contract.name):''}</div></section>
        <section><h4>Failure behavior</h4><p>${esc(r.failure)}</p></section>`;
    } else if(ref.type==='contract'){
      body=`<div class="inspector-kv"><span>From</span><b>${esc(r.from)}</b><span>To</span><b>${esc(r.to)}</b></div>
        <section><h4>Input</h4><code class="block-code">${esc(r.input)}</code></section>
        <section><h4>Output</h4><code class="block-code">${esc(r.output)}</code></section>
        <section><h4>Failure behavior</h4><p>${esc(r.failure)}</p></section>`;
    } else if(ref.type==='domainLanguage'){
      body=`<div class="inspector-kv"><span>ID</span><b>${esc(r.atlasId)}</b><span>Uses</span><b>${esc(r.uses.join(', '))}</b></div>
        <section><h4>Types</h4><div class="chip-row">${chips(r.types,'type-token')}</div></section>
        <section><h4>Verbs</h4><div class="chip-row">${chips(r.verbs,'verb-token')}</div></section>
        <section><h4>Constraints</h4><div class="chip-row">${chips(r.constraints,'constraint-token')}</div></section>`;
    } else if(ref.type==='coreLanguage'){
      body=`<div class="inspector-kv"><span>ID</span><b>${esc(r.atlasId)}</b><span>Role</span><b>${esc(r.verb)}</b></div>`;
    } else if(ref.type==='stage'){
      body=`<div class="inspector-kv"><span>Step</span><b>${esc(r.step)}</b><span>Lifecycle</span><b>Authoritative commit loop</b></div>`;
    } else if(ref.type==='slice'){
      body=`<div class="inspector-kv"><span>Declared</span><b>${esc(r.declaredState)}</b><span>Evidence</span><b>${esc(r.evidenceState)}</b></div><section><h4>Checks</h4><div class="check-list">${Object.entries(r.checks).map(([k,v])=>`<div><span>${esc(labelize(k))}</span>${evidenceCell(v)}</div>`).join('')}</div></section>`;
    } else if(ref.type==='evidence'){
      body=`<div class="inspector-kv"><span>Kind</span><b>${esc(labelize(r.kind))}</b><span>State</span><b>${esc(labelize(r.state))}</b></div><section><h4>Supports</h4><div class="chip-row">${chips(r.supports)}</div></section><section><h4>Source</h4><p>${r.source?esc(r.source):'No repository source linked yet.'}</p></section>`;
    }

    inspector.innerHTML=`
      <div class="inspector-content" data-help-root="true">
        <div class="eyebrow">${esc(labelize(ref.type))}</div>
        <div class="inspector-title"><h2>${esc(ref.name)}</h2><span>${esc(ref.atlasId)}</span></div>
        <p class="inspector-summary">${esc(ref.summary)}</p>
        <p class="inspector-explanation">${esc(ref.explanation)}</p>
        ${body}
      </div>`;
  }

  return { renderView, renderIndex, renderInspector, drawRelationships };
}
