export function validateNorthStar(policy, constitution, contracts, markdown) {
  const errors = [];
  const check = (ok, msg) => { if (!ok) errors.push(msg); };
  const ids = new Set();
  const refs = new Set([...constitution.invariants.map(x => x.id), ...contracts.map(x => x.id)]);
  check(policy.apiVersion === 'plasma.spec/v1' && policy.kind === 'NorthStarPolicy' && policy.id === 'PLS-NORTH-STAR', 'invalid North Star identity');
  check(policy.version === '1.0.0' && policy.status === 'proposed', 'North Star version/status requires reviewed validator amendment');
  for (const r of policy.requirements || []) {
    check(/^NS-0[1-9]$/.test(r.id) && !ids.has(r.id), 'invalid or duplicate requirement: ' + r.id);
    ids.add(r.id);
    check(typeof r.rule === 'string' && r.rule.trim() && typeof r.requiredProof === 'string' && r.requiredProof.trim(), r.id + ': missing requirement/proof');
    check(Array.isArray(r.authority) && r.authority.length > 0 && r.authority.every(x => refs.has(x)), r.id + ': unknown authority reference');
    check(Array.isArray(r.evidence) && r.evidence.length === 0, r.id + ': evidence ingestion is not implemented; no proof claims allowed');
    check(markdown.includes('| ' + r.id + ' | ' + r.rule + ' | ' + r.authority.join(', ') + ' | ' + r.requiredProof + ' |'), r.id + ': human policy drift');
  }
  check(ids.size === 9, 'North Star must contain all nine requirements');
  const programmes = new Set(), covered = new Set();
  for (const p of policy.programmes || []) {
    check(typeof p.programme === 'string' && !programmes.has(p.programme), 'duplicate or invalid programme');
    programmes.add(p.programme);
    check(Array.isArray(p.requirements) && p.requirements.length > 0 && p.requirements.every(x => ids.has(x)), p.programme + ': invalid requirement mapping');
    for (const id of p.requirements || []) covered.add(id);
    check(typeof p.completionEvidence === 'string' && p.completionEvidence.trim(), p.programme + ': missing completion evidence');
  }
  check(programmes.size === 11 && covered.size === 9, 'programme traceability incomplete');
  const t = policy.performanceTargets || {};
  check(t.navigationFps === 60 && t.previewP95Ms === 33 && t.selectionP95Ms === 50 && t.rigidDragGeometryRequests === 0 && t.staleCommits === 0, 'performance targets differ from reviewed policy');
  check(Array.isArray(policy.qualificationFixtures) && policy.qualificationFixtures.length >= 5, 'qualification fixtures missing');
  return errors;
}
