const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const repoUrl = path => `https://github.com/benresonance-star/PLASMA/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`;
const pretty = value => String(value || 'unknown').replaceAll('_',' ');
const ref = (type,id,label) => `<button class="strategy-ref" type="button" data-atlas-type="${esc(type)}" data-atlas-id="${esc(id)}">${esc(label)}</button>`;

export function renderStrategy(model, route) {
  const data=model.data.strategy, objectives=data.objectives || [];
  const active=objectives.find(x => x.id===route.id && route.type==='strategy') || objectives[0];
  if(!active) return '<div class="fatal-error"><h2>No strategy records</h2></div>';
  const linkedContracts=active.contractsResolved.map(x=>x.atlasId?ref('contract',x.atlasId,x.id):`<a class="strategy-ref" href="${esc(repoUrl(x.source))}" target="_blank" rel="noopener">${esc(x.id)} ↗</a>`).join('');
  return `<div class="view-scroll"><section class="view-stage strategy-stage" data-base-width="1080">
    <div class="view-intro strategy-intro"><div><div class="eyebrow">Canonical strategic traceability · /spec</div><h2>Why → architecture → code → proof</h2><p>${esc(data.mission)}</p><p>${esc(data.thesis)}</p></div><span class="principle">${objectives.length} traced objectives</span></div>
    <section class="atlas-section strategy-chain" aria-label="Traceability hierarchy">${data.path.map((s,i)=>`<div class="strategy-chain-step"><small>${String(i+1).padStart(2,'0')}</small><b>${esc(s.label)}</b><span>${esc(s.question)}</span></div>`).join('')}</section>
    <section class="atlas-section">
      <div class="section-heading"><h3>Choose a strategic objective</h3><span>Select a card for its full trace and inspector</span></div>
      <div class="strategy-objectives">${objectives.map(item=>`<button class="strategy-objective ${item.id===active.id?'selected':''}" type="button" data-atlas-type="strategy" data-atlas-id="${esc(item.id)}" aria-pressed="${item.id===active.id}"><small>${esc(item.id)}</small><b>${esc(item.title)}</b><span>${esc(item.outcome)}</span><em>Proof: ${esc(pretty(item.proof.verification))}</em></button>`).join('')}</div>
    </section>
    <section class="atlas-section strategy-thread">
      <div class="section-heading"><div><span class="eyebrow">${esc(active.id)} · selected trace</span><h3>${esc(active.title)}</h3></div><span>Intent → actual code → unproven work</span></div>
      <div class="strategy-intent-grid"><div><span>Strategic outcome</span><p>${esc(active.outcome)}</p></div><div><span>Required capability</span><p>${esc(active.capability)}</p></div><div><span>Constitutional invariant</span><p><b>${esc(active.invariant)}</b> — ${esc(data.invariants?.[active.invariant]||'governed architectural rule')}</p></div></div>
      <div class="strategy-links"><div><strong>Architecture systems</strong><div>${active.components.map(id=>ref('component',id,id)).join('')}</div></div><div><strong>Typed contracts</strong><div>${linkedContracts}</div></div></div>
      <h4>Reusable design patterns</h4><div class="strategy-patterns">${active.patterns.map(x=>`<div><b>${esc(x.name)}</b><p>${esc(x.why)}</p></div>`).join('')}</div>
      <h4>Code paths · presence is not verification</h4><div class="strategy-files">${active.code.map(x=>`<a class="strategy-file" href="${esc(repoUrl(x.path))}" target="_blank" rel="noopener"><code>${esc(x.path)}</code><span>${esc(x.role)}</span><strong>${x.exists?'Source exists':'Missing'} ↗</strong></a>`).join('')}</div>
      <div class="strategy-proof"><div><span class="eyebrow">End-to-end verification · canonical slice</span><h4>${esc(active.proof.id)}</h4><p>${esc(active.proofExpectation)}</p></div><div class="strategy-proof-status"><span>Implementation: <b>${esc(pretty(active.proof.implementation))}</b></span><span>Verification: <b>${esc(pretty(active.proof.verification))}</b></span><span>Release: <b>${esc(pretty(active.proof.release))}</b></span><a href="${esc(repoUrl(active.proof.source))}" target="_blank" rel="noopener">Open slice specification ↗</a></div></div>
    </section><p class="strategy-footer">Source-file presence is not proof of functionality. End-to-end maturity is derived from the canonical verification slice, not inferred from code or unit tests.</p>
  </section></div>`;
}
export function renderStrategyInspector(model, item, refButton) {
  return `<div class="inspector-kv"><span>Objective</span><b>${esc(item.id)}</b><span>Invariant</span><b>${esc(item.invariant)}</b><span>Implementation</span><b>${esc(pretty(item.proof.implementation))}</b><span>Verification</span><b>${esc(pretty(item.proof.verification))}</b></div>
    <section><h4>Why it matters</h4><p>${esc(item.outcome)}</p></section>
    <section><h4>Required capability</h4><p>${esc(item.capability)}</p></section>
    <section><h4>Architecture systems</h4><div class="ref-list">${item.components.map(id=>{const x=model.by.component.get(id);return x?refButton('component',id,x.name):''}).join('')}</div></section>
    <section><h4>Contracts</h4><div class="ref-list">${item.contractsResolved.map(x=>x.atlasId?refButton('contract',x.atlasId,x.id):`<a class="repo-run-link" href="${esc(repoUrl(x.source))}" target="_blank" rel="noopener">${esc(x.id)} ↗</a>`).join('')}</div></section>
    <section><h4>Design patterns</h4>${item.patterns.map(x=>`<p><b>${esc(x.name)}</b> — ${esc(x.why)}</p>`).join('')}</section>
    <section><h4>Code · not proof</h4>${item.code.map(x=>`<p><a class="repo-run-link" href="${esc(repoUrl(x.path))}" target="_blank" rel="noopener">${esc(x.path)} ↗</a><br>${esc(x.role)}</p>`).join('')}</section>
    <section><h4>Proof required</h4><p>${esc(item.proofExpectation)}</p><a class="repo-run-link" href="${esc(repoUrl(item.proof.source))}" target="_blank" rel="noopener">Canonical slice ↗</a></section>`;
}
