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

function evidenceCoverageLabel(coverage) {
  if (!coverage) return 'No evidence';
  if (coverage.state === 'verified') return `✓ ${coverage.verified}/${coverage.required}`;
  if (coverage.state === 'failed') return `× ${coverage.failed} failed`;
  if (coverage.state === 'stale') return '! stale';
  if (coverage.state === 'partial') return `◐ ${coverage.verified}/${coverage.required}`;
  if (coverage.state === 'not-required') return '—';
  return `○ ${coverage.verified}/${coverage.required}`;
}

function evidenceCoverageBadge(coverage) {
  const state=coverage?.state||'unlinked';
  return `<span class="evidence-coverage ${esc(state)}"><b>${esc(evidenceCoverageLabel(coverage))}</b><small>${esc(labelize(state))}</small></span>`;
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
      ${type === 'domainLanguage' && item.maturity ? `<div class="language-maturity">${statusBadge(item.maturity,item.maturity==='active'?'good':item.maturity==='planned'?'warn':'')}</div>` : ''}
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
    if (view === 'integration') renderIntegration(route);
    else if (view === 'languages') renderLanguages(route);
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

  function renderIntegration(route) {
    const rows=model.data.integration.matrixRows;
    const slices=model.data.slices;
    const insights=model.integrationInsights();
    const repositoryEvidence=model.repositoryEvidence;
    const repoCounts=model.data.evidence.reduce((acc,evidence)=>{
      const state=evidence.verification?.status||'unlinked';
      acc[state]=(acc[state]||0)+1;
      return acc;
    },{});
    const stateSymbol={defined:'●',partial:'◐',planned:'○'};
    const stateTone={defined:'good',partial:'warn',planned:'planned'};
    const selectedKey=route.type&&route.id?`${route.type}:${route.id}`:'';
    const insightList=(items,empty='None')=>items.length
      ? `<div class="integration-insight-list">${items.map(item=>`<span>${esc(item)}</span>`).join('')}</div>`
      : `<span class="integration-none">${esc(empty)}</span>`;

    viewHost.innerHTML=`
      <div class="view-scroll">
        <section class="view-stage integration-stage" data-base-width="1320">
          <div class="view-intro">
            <div><div class="eyebrow">Integration graph</div><h2>One architecture, tested through many slices</h2>
            <p>${esc(model.data.integration.principle)} Architecture state and evidence state are deliberately separate.</p></div>
            <div class="principle">Views are projections of one graph</div>
          </div>

          <section class="atlas-section repository-evidence-summary">
            <div class="section-heading"><div><div class="eyebrow">Repository evidence</div><h3>Current Plasma implementation status</h3></div><span>${repositoryEvidence?.available?'live main read':repositoryEvidence?.mode||'offline'}</span></div>
            <div class="repository-status-grid">
              <article class="repository-status-card repository-head"><span>Repository head</span><b>${repositoryEvidence?.headSha?esc(repositoryEvidence.headSha.slice(0,12)):'not available'}</b><small>${esc(repositoryEvidence?.message||'No live repository status available.')}</small></article>
              <article class="repository-status-card verified"><span>Verified</span><b>${repoCounts.verified||0}</b><small>passing evidence for current source state</small></article>
              <article class="repository-status-card stale"><span>Stale</span><b>${repoCounts.stale||0}</b><small>previous proof invalidated by relevant change</small></article>
              <article class="repository-status-card failed"><span>Failed</span><b>${repoCounts.failed||0}</b><small>current evidence test failed</small></article>
              <article class="repository-status-card linked"><span>Linked</span><b>${repoCounts.linked||0}</b><small>repository proof exists but is not verified yet</small></article>
              <article class="repository-status-card unlinked"><span>Unlinked</span><b>${repoCounts.unlinked||0}</b><small>no executable repository proof yet</small></article>
            </div>
            <p class="repository-status-note">Evidence states are read from GitHub Actions for <b>main</b> when available. A passing older observation remains valid only when its bound implementation, test, Atlas evidence definition and repository binding have not changed.</p>
          </section>

          <section class="atlas-section integration-summary">
            <div class="section-heading"><div><div class="eyebrow">Live graph queries</div><h3>Where integration is thin</h3></div><span>${model.links.length} typed links</span></div>
            <div class="integration-insights">
              <article><b>${insights.uncovered.length}</b><span>capabilities with no slice coverage</span>${insightList(insights.uncovered.map(x=>x.row.label),'All matrix capabilities have slice coverage')}</article>
              <article><b>${insights.singleSlice.length}</b><span>capabilities covered by one slice only</span>${insightList(insights.singleSlice.map(x=>`${x.row.label} → ${x.coveredBy[0].slice.name}`),'No single-slice dependencies')}</article>
              <article><b>${insights.partialOrPlanned.length}</b><span>partial / planned slice links</span>${insightList(insights.partialOrPlanned.slice(0,8).map(x=>`${model.by.slice.get(x.from.id)?.name||x.from.id} → ${model.resolve(x.to.type,x.to.id)?.name||x.to.id} [${x.architectureState}]`),'No partial integrations')}</article>
              <article><b>${insights.unlinkedEvidence.length}</b><span>evidence requirements still unlinked</span>${insightList(insights.unlinkedEvidence.slice(0,8).map(x=>x.name),'All evidence is linked')}</article>
            </div>
          </section>

          <section class="atlas-section integration-matrix-section">
            <div class="section-heading"><div><div class="eyebrow">Coverage matrix</div><h3>Which architectural capabilities each vertical slice exercises</h3></div><span>click a row, slice or cell to inspect its graph connections</span></div>
            <div class="integration-legend">
              ${model.data.integration.architectureStates.map(x=>`<span class="legend-state ${esc(x.id)}"><b>${stateSymbol[x.id]||'·'}</b>${esc(x.label)}</span>`).join('')}
              <span class="legend-state evidence-key">✓ n/n verified</span>
              <span class="legend-state evidence-key">◐ n/n partial</span>
              <span class="legend-state evidence-key">○ 0/n unlinked</span>
              <span class="legend-state evidence-key">× failed</span>
              <span class="legend-state none">— not materially exercised / not required</span>
            </div>
            <div class="integration-matrix" style="grid-template-columns:150px repeat(${slices.length},minmax(86px,1fr))">
              <div class="matrix-corner">Capability</div>
              ${slices.map(slice=>`<button class="matrix-slice-head ${selectedKey===`slice:${slice.id}`?'selected':''}" data-atlas-type="slice" data-atlas-id="${esc(slice.id)}"><span>${esc(slice.name)}</span></button>`).join('')}
              ${rows.map(row=>{
                const rowRef=model.resolve(row.ref.type,row.ref.id);
                return `
                  <button class="matrix-row-head ${selectedKey===`${row.ref.type}:${row.ref.id}`?'selected':''}" data-atlas-type="${esc(row.ref.type)}" data-atlas-id="${esc(row.ref.id)}"><b>${esc(row.label)}</b><small>${esc(rowRef?.name||row.ref.id)}</small></button>
                  ${slices.map(slice=>{
                    const link=model.integrationCoverage(slice.id,row.ref);
                    if(!link)return `<span class="matrix-cell none" title="Not materially exercised">—</span>`;
                    const evidence=model.deriveEvidenceCoverage(link);
                    const selected=route.type==='integrationLink'&&route.id===link.id;
                    return `<button class="matrix-cell ${stateTone[link.architectureState]||''} evidence-${esc(evidence.state)} ${selected?'selected':''}" data-atlas-type="integrationLink" data-atlas-id="${esc(link.id)}" title="${esc(slice.name)} → ${esc(row.label)} · architecture ${esc(link.architectureState)} · evidence ${esc(evidence.state)} ${evidence.verified}/${evidence.required}"><b class="matrix-architecture">${stateSymbol[link.architectureState]||'·'}</b><span class="matrix-evidence">${esc(evidenceCoverageLabel(evidence))}</span></button>`;
                  }).join('')}`;
              }).join('')}
            </div>
          </section>

          <section class="atlas-section maturity-section">
            <div class="section-heading"><div><div class="eyebrow">Domain integration</div><h3>Language maturity</h3></div><span>promoted from future labels to addressable Atlas nodes</span></div>
            <div class="maturity-grid">
              ${model.data.languages.domain.map(lang=>`<button class="maturity-card" data-atlas-type="domainLanguage" data-atlas-id="${esc(lang.id)}"><span class="eyebrow">${esc(lang.atlasId)}</span><b>${esc(lang.name)}</b>${statusBadge(lang.maturity,lang.maturity==='active'?'good':lang.maturity==='planned'?'warn':'')}</button>`).join('')}
            </div>
          </section>
        </section>
      </div>`;
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
            ${lang.futureDomains.length ? `<div class="future-row"><b>Future domains</b>${lang.futureDomains.map(x=>`<span>${esc(x)}</span>`).join('')}</div>` : ''}
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
      <div class="view-scroll"><section class="view-stage catalogue-stage slice-stage" data-base-width="1040">
        <div class="view-intro"><div><div class="eyebrow">Vertical slices</div><h2>End-to-end capability proofs</h2><p>A vertical slice is not a feature list. Each one deliberately crosses multiple Plasma boundaries to prove that authority, languages, geometry, analysis, evidence, fabrication and representations work together coherently.</p></div><div class="principle warning">${model.data.slices.length} proving slices</div></div>
        <div class="slice-catalogue">${model.data.slices.map(s=>`<button class="slice-card ${selected===s.id?'selected':''}" data-atlas-type="slice" data-atlas-id="${esc(s.id)}">
          <div class="slice-head"><div><span class="eyebrow">${esc(s.domain)} · vertical slice</span><h3>${esc(s.name)}</h3></div>${statusBadge(s.evidenceState,'warn')}</div>
          <p class="slice-summary">${esc(s.summary)}</p>
          <div class="slice-purpose"><b>What it proves</b><p>${esc(s.purpose)}</p></div>
          <div class="slice-flow">
            ${s.flow.map((step,index)=>`<span><i>${String(index+1).padStart(2,'0')}</i>${esc(step)}</span>`).join('')}
          </div>
          <div class="slice-system-row"><b>Touches</b><div>${s.keySystems.map(system=>`<span class="chip">${esc(system)}</span>`).join('')}</div></div>
          <div class="slice-checks">
            ${Object.entries(s.checks).map(([k,v])=>`<div><span>${esc(labelize(k))}</span>${evidenceCell(v)}</div>`).join('')}
          </div>
          <small>Declared state: ${esc(s.declaredState)} · Select for stress points and success criteria</small>
        </button>`).join('')}</div>
      </section></div>`;
  }

  function renderEvidence(route) {
    const selected=route.type==='evidence'?route.id:null;
    const linked=model.data.evidence.filter(x=>['linked','verified'].includes(x.verification?.status)).length;
    viewHost.innerHTML=`
      <div class="view-scroll"><section class="view-stage catalogue-stage" data-base-width="960">
        <div class="view-intro"><div><div class="eyebrow">Evidence ledger</div><h2>What is trusted, and why?</h2><p>Evidence records carry verification status. Integration relationships derive their evidence state from these records; no matrix state is authored separately.</p></div><div class="evidence-summary"><b>${linked}</b><span>linked or verified of ${model.data.evidence.length}</span></div></div>
        <div class="evidence-list">${model.data.evidence.map(e=>{
          const status=e.verification?.status||'unlinked';
          const usage=model.evidenceUsers(e.id).length;
          return `<button class="evidence-card ${selected===e.id?'selected':''}" data-atlas-type="evidence" data-atlas-id="${esc(e.id)}">
            <div><span class="eyebrow">${esc(labelize(e.kind))}</span><h3>${esc(e.name)}</h3><p>${esc(e.description)}</p></div>
            <div class="evidence-side">${statusBadge(status,status==='verified'?'good':status==='failed'?'danger':'warn')}<small>${usage} integration relationship${usage===1?'':'s'}</small></div>
          </button>`;
        }).join('')}</div>
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
      body=`<div class="inspector-kv"><span>ID</span><b>${esc(r.atlasId)}</b><span>Maturity</span><b>${esc(labelize(r.maturity))}</b><span>Uses</span><b>${esc(r.uses.join(', '))}</b></div>
        <section><h4>Types</h4><div class="chip-row">${chips(r.types,'type-token')}</div></section>
        <section><h4>Verbs</h4><div class="chip-row">${chips(r.verbs,'verb-token')}</div></section>
        <section><h4>Constraints</h4><div class="chip-row">${chips(r.constraints,'constraint-token')}</div></section>`;
    } else if(ref.type==='coreLanguage'){
      body=`<div class="inspector-kv"><span>ID</span><b>${esc(r.atlasId)}</b><span>Role</span><b>${esc(r.verb)}</b></div>`;
    } else if(ref.type==='stage'){
      body=`<div class="inspector-kv"><span>Step</span><b>${esc(r.step)}</b><span>Lifecycle</span><b>Authoritative commit loop</b></div>`;
    } else if(ref.type==='slice'){
      const orderedList=(items,cls='')=>`<div class="inspector-list ${cls}">${items.map((item,index)=>`<div><span>${String(index+1).padStart(2,'0')}</span><p>${esc(item)}</p></div>`).join('')}</div>`;
      body=`
        <div class="inspector-kv"><span>Domain</span><b>${esc(r.domain)}</b><span>Declared</span><b>${esc(r.declaredState)}</b><span>Evidence</span><b>${esc(r.evidenceState)}</b></div>
        <section><h4>Why this slice</h4><p>${esc(r.whyThisSlice)}</p></section>
        <section><h4>End-to-end flow</h4>${orderedList(r.flow,'flow-list')}</section>
        <section><h4>Architectural claims it must prove</h4>${orderedList(r.proves)}</section>
        <section><h4>Stress points</h4>${orderedList(r.stressPoints,'stress-list')}</section>
        <section><h4>Success criteria</h4>${orderedList(r.successCriteria,'success-list')}</section>
        <section><h4>Key systems</h4><div class="chip-row">${chips(r.keySystems)}</div></section>
        <section><h4>Integration evidence</h4><div class="ref-list">${(r.integrationEvidence||[]).map(id=>{const e=model.by.evidence.get(id);return e?refButton('evidence',id,e.name):''}).join('')||'<span class="muted">No scenario linked</span>'}</div></section>
        <section><h4>Evidence checks</h4><div class="check-list">${Object.entries(r.checks).map(([k,v])=>`<div><span>${esc(labelize(k))}</span>${evidenceCell(v)}</div>`).join('')}</div></section>`;
    } else if(ref.type==='integrationLink'){
      const coverage=model.deriveEvidenceCoverage(r);
      const from=model.resolve(r.from.type,r.from.id);
      const to=model.resolve(r.to.type,r.to.id);
      const renderEvidenceItems=(items,empty)=>items.length?`<div class="evidence-ref-list">${items.map(({ref:evidenceRef,evidence})=>`
        <button type="button" data-atlas-type="evidence" data-atlas-id="${esc(evidence.id)}">
          <span>${esc(labelize(evidenceRef.requirement))}</span>
          <b>${esc(evidence.name)}</b>
          <small>${esc(labelize(evidence.verification?.status||'unlinked'))}${evidenceRef.proves?.length?` · ${evidenceRef.proves.length} criteria`:''}</small>
        </button>`).join('')}</div>`:`<span class="muted">${esc(empty)}</span>`;
      body=`
        <div class="inspector-kv"><span>Role</span><b>${esc(labelize(r.role))}</b><span>Architecture</span><b>${esc(labelize(r.architectureState))}</b><span>Evidence</span><b>${esc(labelize(coverage.state))} · ${coverage.verified}/${coverage.required}</b><span>Policy</span><b>${esc(labelize(coverage.policy.mode))}</b></div>
        <section><h4>From → To</h4><div class="ref-list">${from?refButton(from.type,from.id,from.name):''}${to?refButton(to.type,to.id,to.name):''}</div></section>
        <section><h4>Required evidence</h4>${renderEvidenceItems(coverage.requiredItems,'No required evidence yet.')}</section>
        <section><h4>Supporting evidence</h4>${renderEvidenceItems(coverage.supportingItems,'No supporting evidence linked.')}</section>
        <section><h4>Coverage</h4>${evidenceCoverageBadge(coverage)}</section>`;
    } else if(ref.type==='evidence'){
      const status=r.verification?.status||'unlinked';
      const users=model.evidenceUsers(r.id);
      const binding=r.repositoryBinding;
      const repo=r.verification?.repository;
      const sourceRows=(binding?.sources||[]).map(source=>`<div><span>${esc(labelize(source.role))}</span><b>${esc((source.paths||[]).join(' · '))}</b></div>`).join('');
      const testRows=(binding?.tests||[]).map(test=>`<div><span>${esc(test.id)}</span><b>${esc((test.paths||[]).join(' · '))}</b></div>`).join('');
      body=`<div class="inspector-kv"><span>Kind</span><b>${esc(labelize(r.kind))}</b><span>State</span><b>${esc(labelize(status))}</b><span>Method</span><b>${esc(labelize(r.verification?.method||'unknown'))}</b></div>
        <section><h4>Claim</h4><p>${esc(r.claim)}</p></section>
        <section><h4>Supports</h4><div class="chip-row">${chips(r.supports)}</div></section>
        ${r.scenario?`<section><h4>Scenario</h4><p>${esc(r.scenario)}</p></section>`:''}
        ${Array.isArray(r.acceptanceCriteria)?`<section><h4>Acceptance criteria</h4><div class="inspector-list success-list">${r.acceptanceCriteria.map((item,index)=>`<div><span>${String(index+1).padStart(2,'0')}</span><p><b>${esc(item.id)}</b><br>${esc(item.text)}</p></div>`).join('')}</div></section>`:''}
        <section><h4>Repository binding</h4>${binding?`<div class="repository-binding"><div class="inspector-kv"><span>Binding</span><b>${esc(binding.id)}</b><span>Freshness</span><b>${esc(labelize(binding.freshnessPolicy?.mode||'unknown'))}</b><span>CI</span><b>${esc(binding.ci?`${binding.ci.workflow} · ${binding.ci.job} · ${binding.ci.step}`:'No executable CI binding yet')}</b></div>${sourceRows?`<h5>Source paths</h5><div class="binding-paths">${sourceRows}</div>`:''}${testRows?`<h5>Test identifiers</h5><div class="binding-paths">${testRows}</div>`:''}</div>`:'<span class="muted">No repository binding declared.</span>'}</section>
        <section><h4>Latest repository observation</h4><div class="inspector-kv"><span>State</span><b>${esc(labelize(status))}</b><span>Tested commit</span><b>${esc(repo?.testedCommitSha?.slice(0,12)||r.verification?.subjectRevision?.slice(0,12)||'—')}</b><span>Main head</span><b>${esc(repo?.headSha?.slice(0,12)||model.repositoryEvidence?.headSha?.slice(0,12)||'—')}</b><span>CI run</span><b>${esc(repo?.workflowRunId?String(repo.workflowRunId):'—')}</b><span>Result</span><b>${esc(r.verification?.result||'—')}</b></div>${r.verification?.staleReason?`<p class="evidence-warning">${esc(r.verification.staleReason)}</p>`:''}${repo?.workflowUrl?`<a class="repo-run-link" href="${esc(repo.workflowUrl)}" target="_blank" rel="noreferrer">Open CI run ↗</a>`:''}</section>
        <section><h4>Verification source</h4><p>${r.verification?.source?esc(r.verification.source):'No repository test source linked yet.'}</p></section>
        <section><h4>Used by Integration relationships · ${users.length}</h4><div class="integration-evidence-users">${users.length?users.map(({link,ref:linkRef,evidenceRef})=>`
          <button type="button" data-atlas-type="integrationLink" data-atlas-id="${esc(link.id)}">
            <span>${esc(labelize(evidenceRef.requirement))}</span>
            <b>${esc(linkRef?.name||link.id)}</b>
            <small>${esc(labelize(link.architectureState))} · ${esc(labelize(model.deriveEvidenceCoverage(link).state))}</small>
          </button>`).join(''):'<span class="muted">No Integration relationships reference this evidence.</span>'}</div></section>`;
    }

    const graphLinks=ref.type==='integrationLink'?[]:model.related(ref.type,ref.id);
    const graphSection=graphLinks.length?`
      <section class="inspector-graph"><h4>Integration graph · ${graphLinks.length}</h4>
        <div class="integration-link-list">${graphLinks
          .filter((item,index,array)=>array.findIndex(other=>other.ref.type===item.ref.type&&other.ref.id===item.ref.id&&other.link.role===item.link.role)===index)
          .slice(0,36)
          .map(({link,ref:linked})=>{const coverage=model.deriveEvidenceCoverage(link);return `<button type="button" data-atlas-type="${esc(linked.type)}" data-atlas-id="${esc(linked.id)}"><span class="integration-link-role">${esc(labelize(link.role))}</span><b>${esc(linked.name)}</b><small>${esc(labelize(link.architectureState))} · evidence ${esc(labelize(coverage.state))} ${coverage.verified}/${coverage.required}</small></button>`}).join('')}
        </div>
      </section>`:'';

    inspector.innerHTML=`
      <div class="inspector-content" data-help-root="true">
        <div class="eyebrow">${esc(labelize(ref.type))}</div>
        <div class="inspector-title"><h2>${esc(ref.name)}</h2><span>${esc(ref.atlasId)}</span></div>
        <p class="inspector-summary">${esc(ref.summary)}</p>
        <p class="inspector-explanation">${esc(ref.explanation)}</p>
        ${body}
        ${graphSection}
      </div>`;
  }

  return { renderView, renderIndex, renderInspector, drawRelationships };
}
