const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#039;");

const refButton = (type,id,label) => '<button type="button" class="ref-chip" data-atlas-type="' + escapeHtml(type) +
  '" data-atlas-id="' + escapeHtml(id) + '">' + escapeHtml(label) + '</button>';

function roleCard(role, selected) {
  return '<button type="button" class="council-role-card ' + (selected ? 'selected' : '') +
    '" data-atlas-type="councilRole" data-atlas-id="' + escapeHtml(role.id) + '">' +
    '<span class="eyebrow">' + escapeHtml(role.phase === 'initial' ? 'Initial reviewer' : 'Deferred specialist') +
    ' · ' + escapeHtml(role.executionStatus) + '</span>' +
    '<h3>' + escapeHtml(role.name) + '</h3><p>' + escapeHtml(role.summary) + '</p>' +
    '<div class="council-role-counts"><span>' + role.components.length + ' systems</span><span>' +
    role.contracts.length + ' contracts</span></div></button>';
}

function decisionCard(model, decision, selected, selectedStage) {
  const steps = decision.stages.map((stage,index) =>
    '<button type="button" class="council-step ' + (selectedStage === decision.id + ':' + stage.id ? 'selected' : '') +
    '" data-atlas-type="councilStage" data-atlas-id="' + escapeHtml(decision.id + ':' + stage.id) +
    '"><span class="eyebrow">' + String(index+1).padStart(2,'0') + ' · ' + escapeHtml(stage.status) +
    '</span><b>' + escapeHtml(stage.name) + '</b><small>' + escapeHtml(stage.output) + '</small></button>'
  ).join('');
  const affected = decision.affectedRefs.map(ref => {
    const linked = model.resolve(ref.type,ref.id);
    return linked ? refButton(ref.type,ref.id,linked.name) : '';
  }).join('');
  return '<div class="council-decision ' + (selected ? 'selected' : '') + '">' +
    '<button type="button" class="council-decision-title" data-atlas-type="councilDecision" data-atlas-id="' +
    escapeHtml(decision.id) + '"><span class="eyebrow">' + escapeHtml(decision.status) + ' · Review ' +
    escapeHtml(decision.reviewStatus) + '</span><h3>' + escapeHtml(decision.name) + '</h3><p>' +
    escapeHtml(decision.summary) + '</p></button>' +
    '<div class="council-stages" aria-label="Proposed review stages">' + steps + '</div>' +
    '<div class="council-impact"><b>Affected systems and contracts</b><div class="ref-list">' + affected +
    '</div></div></div>';
}

export function renderCouncilView(model, viewHost, route) {
  const roles = model.council.roles || [];
  const decisions = model.council.decisions || [];
  const section = (title, label, items) => '<section class="atlas-section"><div class="section-heading"><div>' +
    '<div class="eyebrow">' + escapeHtml(label) + '</div><h3>' + escapeHtml(title) +
    '</h3></div></div><div class="council-role-grid">' + items + '</div></section>';
  viewHost.innerHTML = '<div class="view-scroll"><section class="view-stage catalogue-stage council-stage" data-base-width="960">' +
    '<div class="view-intro"><div><div class="eyebrow">Development governance · proposed</div>' +
    '<h2>Architecture Council</h2><p>Who examines Plasma architecture, which real contracts they review, and how proposals would be challenged. Distinct from the runtime Intelligence Plane.</p></div>' +
    '<div class="principle warning">No agent runs recorded</div></div>' +
    section('Initial reviewers','Phase 01',roles.filter(x=>x.phase==='initial').map(x=>roleCard(x,route.type==='councilRole'&&route.id===x.id)).join('')) +
    section('Deferred until needed','Later specialists',roles.filter(x=>x.phase==='deferred').map(x=>roleCard(x,route.type==='councilRole'&&route.id===x.id)).join('')) +
    '<section class="atlas-section"><div class="section-heading"><div><div class="eyebrow">Architecture decision trace</div><h3>Examples, not executed reviews</h3></div></div>' +
    decisions.map(d=>decisionCard(model,d,route.type==='councilDecision'&&route.id===d.id,route.type==='councilStage'?route.id:null)).join('') +
    '</section><p class="council-disclaimer">This view is generated from the canonical /spec catalogue. No agent credentials, executions, approvals or verifications are implied.</p></section></div>';
}

const refGroup = (items,type) => items.map(item=>refButton(type,item.id,item.name)).join('') || '<span class="muted">None assigned</span>';

export function renderCouncilInspector(model, ref) {
  const r = ref.raw;
  if (ref.type === 'councilRole') {
    const components = r.components.map(id=>model.by.component.get(id)).filter(Boolean);
    const contracts = r.contracts.map(id=>model.by.contract.get(id)).filter(Boolean);
    return '<div class="inspector-kv"><span>Phase</span><b>' + escapeHtml(r.phase) +
      '</b><span>Authority</span><b>Review only</b><span>Execution</span><b>' + escapeHtml(r.executionStatus) + '</b></div>' +
      '<section><h4>Responsibilities</h4><p>' + escapeHtml(r.responsibilities.join(' · ')) + '</p></section>' +
      '<section><h4>Reviewed components</h4><div class="ref-list">' + refGroup(components,'component') + '</div></section>' +
      '<section><h4>Reviewed contracts</h4><div class="ref-list">' + refGroup(contracts,'contract') + '</div></section>' +
      '<section><h4>Learning focus</h4><p>' + escapeHtml(r.learning) + '</p></section>' +
      '<section><h4>Forbidden actions</h4><p>' + escapeHtml(r.forbidden.join(' · ')) + '</p></section>';
  }
  if (ref.type === 'councilDecision') {
    const alternatives = r.alternatives.map(item=>'<p><b>' + escapeHtml(item.name) +
      '</b> · unassessed · ' + escapeHtml(item.tradeoff) + '</p>').join('');
    const affected = r.affectedRefs.map(item=>model.resolve(item.type,item.id)).filter(Boolean);
    return '<div class="inspector-kv"><span>Record</span><b>' + escapeHtml(r.status) +
      '</b><span>Review</span><b>' + escapeHtml(r.reviewStatus) +
      '</b><span>Approval</span><b>' + escapeHtml(r.approvalStatus) + '</b></div>' +
      '<section><h4>Problem</h4><p>' + escapeHtml(r.problem) + '</p></section>' +
      '<section><h4>Alternatives · unassessed</h4>' + alternatives + '</section>' +
      '<section><h4>Review stages · not run</h4><div class="ref-list">' +
      r.stages.map(s=>refButton('councilStage',r.id+':'+s.id,s.name)).join('') + '</div></section>' +
      '<section><h4>Affected architecture</h4><div class="ref-list">' +
      affected.map(item=>refButton(item.type,item.id,item.name)).join('') + '</div></section>' +
      '<section><h4>Evidence</h4><p>No agent review, human approval or linked test evidence has been recorded for this illustrative decision.</p></section>';
  }
  if (ref.type === 'councilStage') {
    const roles = r.roleIds.map(id=>model.by.councilRole.get(id)).filter(Boolean);
    return '<div class="inspector-kv"><span>Status</span><b>' + escapeHtml(r.status) +
      '</b><span>Decision</span><b>' + escapeHtml(r.decisionId) + '</b></div>' +
      '<section><h4>Review question</h4><p>' + escapeHtml(r.question) + '</p></section>' +
      '<section><h4>Reviewers</h4><div class="ref-list">' + refGroup(roles,'councilRole') + '</div></section>' +
      '<section><h4>Expected output</h4><p>' + escapeHtml(r.output) + '</p></section>' +
      '<section><h4>Back to decision</h4><div class="ref-list">' +
      refButton('councilDecision',r.decisionId,'Open proposed decision') + '</div></section>';
  }
  return '';
}

export function councilReverseLinks(model, type, id) {
  const reviewers = model.councilRolesFor(type,id);
  const decisions = model.councilDecisionsFor(type,id);
  return '<section class="council-inspector-links"><h4>Architecture Council reviewers · ' + reviewers.length +
    '</h4><p class="inspector-help">Assigned review roles only. No agent reviews have executed.</p>' +
    '<div class="ref-list">' + refGroup(reviewers,'councilRole') + '</div></section>' +
    '<section><h4>Related decision traces · ' + decisions.length + '</h4><div class="ref-list">' +
    refGroup(decisions,'councilDecision') + '</div></section>';
}
