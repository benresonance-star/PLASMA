const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#039;");
const button = (type,id,title) => '<button type="button" class="ref-chip" data-atlas-type="' + esc(type) +
  '" data-atlas-id="' + esc(id) + '">' + esc(title) + '</button>';
const list = arr => '<ul class="reference-bullets">' + arr.map(v=>'<li>' + esc(v) + '</li>').join('') + '</ul>';
const alternatives = arr => '<div class="reference-alternatives">' + arr.map(a=>'<div><b>' + esc(a.name) +
  '</b><p>' + esc(a.tradeoff) + '</p></div>').join('') + '</div>';
const repoUrl = path => 'https://github.com/benresonance-star/PLASMA/blob/main/' +
  path.split('/').map(encodeURIComponent).join('/');

function referenceCard(item,type,selected) {
  return '<button type="button" class="reference-card ' + (selected ? 'selected' : '') +
    '" data-atlas-type="' + esc(type) + '" data-atlas-id="' + esc(item.id) + '">' +
    '<div class="reference-card-top"><span class="eyebrow">' +
    esc(type === 'referenceSystem' ? 'System · ' + item.currentState : item.category + ' · ' + item.adoption) +
    '</span><span class="reference-card-arrow">↗</span></div><h3>' + esc(item.name) + '</h3>' +
    '<p class="reference-what">' + esc(type === 'referenceSystem' ? item.summary : item.what) + '</p>' +
    '<div class="reference-card-why"><b>Why Plasma uses it</b><p>' + esc(item.why) + '</p></div>' +
    '<div class="reference-mini-metrics"><span>+ ' + esc(item.strengths[0]) + '</span>' +
    '<span>− ' + esc(item.weaknesses[0]) + '</span></div>' +
    '<div class="reference-card-foot">' + item.alternatives.length + ' alternatives · ' +
    item.relationships.length + ' typed links</div></button>';
}

export function renderReferenceView(model, viewHost, route) {
  const groups = [
    {heading:'Plasma system architecture',label:'Canonical architecture components',type:'referenceSystem',items:model.references.systems},
    {heading:'Technology stack',label:'Repository-grounded technology choices',type:'referenceTechnology',items:model.references.technologies}
  ];
  viewHost.innerHTML = '<div class="view-scroll"><section class="view-stage catalogue-stage reference-stage" data-base-width="1040">' +
    '<div class="view-intro"><div><div class="eyebrow">Technical reference library</div><h2>Systems & technologies</h2>' +
    '<p>What each choice is, why it exists, strengths, limitations, alternatives and its connections. Select a card for detailed inspection.</p></div>' +
    '<div class="principle">Architecture ≠ implementation proof</div></div>' +
    groups.map(group => '<section class="atlas-section"><div class="section-heading"><div><div class="eyebrow">' +
      esc(group.label) + ' · ' + group.items.length + '</div><h3>' + esc(group.heading) + '</h3></div></div>' +
      '<div class="reference-card-grid">' + group.items.map(item=>referenceCard(item,group.type,route.type===group.type && route.id===item.id)).join('') +
      '</div></section>').join('') +
    '<p class="council-disclaimer">' + esc(model.references.disclaimer) + '</p></section></div>';
}

export function renderReferenceInspector(model, ref) {
  const r = ref.raw;
  const system = ref.type === 'referenceSystem';
  const related = model.referenceLinksFor(ref.type,ref.id);
  const links = related.map(item => {
    const resolved = model.resolve(item.ref.type,item.ref.id);
    if (!resolved) return '';
    return '<div class="reference-relation"><span>' + esc(item.direction==='in'?'← referenced by · ':'→ relates to · ') +
      esc(item.role.replaceAll('-',' ')) + '</span>' + button(resolved.type,resolved.id,resolved.name) + '</div>';
  }).join('');
  const sources = system ?
    '<p>Canonical system definition: ' + button('component',r.id,'Open architectural component') + '</p>' :
    '<div class="reference-sources">' + r.sourcePaths.map(path =>
      '<a class="repo-run-link" href="' + esc(repoUrl(path)) + '" target="_blank" rel="noopener noreferrer">' +
      esc(path) + ' ↗</a>').join('') + '</div>';
  return '<div class="inspector-kv"><span>Category</span><b>' + esc(system?'Plasma system':r.category) +
    '</b><span>Repository status</span><b>' + esc(system?r.currentState:r.adoption) +
    '</b></div>' +
    '<section><h4>What it is</h4><p>' + esc(r.what) + '</p></section>' +
    '<section><h4>Why we use it</h4><p>' + esc(r.why) + '</p></section>' +
    '<section><h4>Strengths</h4>' + list(r.strengths) + '</section>' +
    '<section><h4>Weaknesses and risks</h4>' + list(r.weaknesses) + '</section>' +
    '<section><h4>Competitors and alternative approaches</h4>' + alternatives(r.alternatives) + '</section>' +
    '<section><h4>Relationships · ' + related.length + '</h4><div class="reference-relations">' +
      (links || '<span class="muted">No references yet.</span>') + '</div></section>' +
    '<section><h4>' + (system?'Canonical architecture':'Repository source evidence') + '</h4>' + sources +
    '<p class="inspector-help">Technology presence is inferred from repository declarations/configuration, not from production verification. Competitors are evaluated alternatives, not installed services.</p></section>';
}

export function referenceReverseLinks(model,type,id) {
  if (type!=='component' && type!=='contract') return '';
  if (type==='contract') return '';
  const system=model.by.referenceSystem.get(id);
  if (!system) return '';
  const linkedTech = model.referenceLinksFor('component',id)
    .map(x=>model.resolve(x.ref.type,x.ref.id)).filter(x=>x?.type==='referenceTechnology');
  const uniqueTech=linkedTech.filter((x,i,all)=>all.findIndex(y=>y.id===x.id)===i);
  return '<section class="reference-inspector-links"><h4>System reference card</h4>' +
    '<div class="ref-list">' + button('referenceSystem',id,'What · Why · Trade-offs') + '</div></section>' +
    '<section><h4>Related technologies · ' + uniqueTech.length + '</h4><div class="ref-list">' +
    uniqueTech.map(x=>button('referenceTechnology',x.id,x.name)).join('') + '</div></section>';
}
