/**
 * Comprehension overlays are projections of the canonical Atlas model.
 * They annotate the SAME ten-node graph; they do not author new state/edges.
 * Scenario steps illustrate intended architecture, never report an executed run.
 */
export const COMPREHENSION_LENSES = Object.freeze([
  {id:'architecture',label:'Architecture',title:'How Plasma works as one system',description:'The complete architecture stays visible. Interactions, authority, solvers and outputs are distinguished without splitting into separate diagrams.',focus:[]},
  {id:'authority',label:'Data & authority',title:'Who owns the truth?',description:'Human and agent interfaces propose. World Authority accepts or rejects transactions. Geometry, documents and analysis cannot silently replace canonical state.',focus:['interaction','intelligence','authority','constraints','external']},
  {id:'implementation',label:'Implementation',title:'Design is not proof of execution',description:'Read each component’s specification status on the same map. Open a component for contracts, repository evidence and implementation references; a declared dependency is not verified behavior.',focus:[]},
  {id:'dependencies',label:'Dependencies',title:'What could a change affect?',description:'Select a system or a typed relationship to isolate connected boundaries. Only explicitly declared links are drawn; other dependencies remain accessible through the Inspector.',focus:[]},
  {id:'decisions',label:'Decisions & evidence',title:'Why these architectural choices?',description:'Select a system to inspect its rationale, alternatives, contracts, evidence requirements and Architecture Council review records. No proposed review is treated as completed.',focus:[]}
]);
export const WALL_EDIT_TRACE = Object.freeze([
  {label:'Propose',description:'User editing or an agent proposes a semantic wall change; a preview is not acceptance.',focus:['interaction','intelligence']},
  {label:'Accept',description:'World Authority governs identity, invariants, transactions and accepted revisions.',focus:['authority']},
  {label:'Check',description:'Constraints evaluate applicable invariants. Rejection and failure evidence must remain visible.',focus:['constraints','authority']},
  {label:'Resolve',description:'Geometry Resolver computes candidate exact or preview representations behind its boundary.',focus:['geometry','authority']},
  {label:'Publish',description:'Derived representations and documentation must track the accepted revision and their own freshness.',focus:['representation','documentation']}
]);
const safe = value => String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");

export function normalizeComprehensionLens(value) {
  return COMPREHENSION_LENSES.some(l=>l.id===value) ? value : 'architecture';
}
export function comprehensionFocus(lens, route, step, model) {
  if (Number.isInteger(step) && step>=0 && step<WALL_EDIT_TRACE.length) return WALL_EDIT_TRACE[step].focus;
  if (route.type==='component' && model.by.component.has(route.id)) {
    const relationships=model.data.relationships.filter(r=>r.from===route.id||r.to===route.id);
    return [...new Set([route.id,...relationships.flatMap(r=>[r.from,r.to])])];
  }
  if(route.type==='relationship') {
    const r=model.by.relationship.get(route.id);
    if(r)return [r.from,r.to];
  }
  return COMPREHENSION_LENSES.find(l=>l.id===lens)?.focus||[];
}
export function renderComprehensionHeader(model, lens, route, step) {
  const selected=COMPREHENSION_LENSES.find(l=>l.id===lens)||COMPREHENSION_LENSES[0];
  const ids=comprehensionFocus(lens,route,step,model);
  const evidence=model.data.evidence.length;
  const selectedSystem=route.type==='component' ? model.by.component.get(route.id) : null;
  const status=selectedSystem ? 'Selected: '+selectedSystem.name+' · '+selectedSystem.status :
    (ids.length ? ids.length+' of '+model.data.components.length+' systems highlighted' : model.data.components.length+' systems in view');
  return `<section class="comprehension-header" aria-label="Architecture understanding lenses">
    <div class="comprehension-intro"><div class="eyebrow">One system · five lenses · one stable map</div><h2>Understand Plasma as a whole</h2>
      <p>Explore the same architecture from different perspectives. The map never rearranges; select any system or boundary for full specification and evidence.</p></div>
    <div class="lens-bar" role="group" aria-label="Architectural lens">
      ${COMPREHENSION_LENSES.map(item=>`<button type="button" class="lens-tab ${item.id===lens?'active':''}" data-lens="${safe(item.id)}" aria-pressed="${item.id===lens}">${safe(item.label)}</button>`).join('')}
    </div>
    <div class="comprehension-statement" aria-live="polite">
      <div><strong>${safe(selected.title)}</strong><p>${safe(selected.description)}</p></div>
      <span class="comprehension-context">${safe(status)}</span>
    </div>
    <div class="comprehension-legend">
      <span><i class="dot authority"></i> canonical authority</span>
      <span><i class="dot agent"></i> agent proposals</span>
      <span><i class="dot runtime"></i> execution</span>
      <span><i class="dot derived"></i> derived state</span>
      <span>${model.data.relationships.length} declared cross-plane links · ${evidence} evidence records</span>
    </div>
  </section>`;
}
export function renderComprehensionTrace(step) {
  const active=Number.isInteger(step)&&step>=0&&step<WALL_EDIT_TRACE.length;
  return `<section class="comprehension-trace" aria-label="Illustrative building change walkthrough">
    <div class="trace-heading"><div><div class="eyebrow">Architecture explained through a change</div><h3>Trace a wall-thickness edit</h3></div><span>Illustrative · not an executed agent run</span></div>
    <div class="trace-steps" role="group" aria-label="Wall change stages">
      ${WALL_EDIT_TRACE.map((item,i)=>`<button class="scenario-step ${step===i?'active':''}" type="button" data-scenario-step="${i}" aria-pressed="${step===i}"><span>${i+1}</span>${safe(item.label)}</button>`).join('')}
      <button class="trace-reset" type="button" data-scenario-reset="true" ${active?'':'disabled'}>Clear</button>
    </div>
    <p class="trace-explanation" aria-live="polite">${active?safe(WALL_EDIT_TRACE[step].description):'Choose a stage to highlight its place in the whole architecture. The path describes intended boundaries; it does not assert that an end-to-end wall edit is implemented.'}</p>
  </section>`;
}
