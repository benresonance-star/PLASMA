// Evidence references are planning links, not assertions of conformance.
export function deriveNorthStarEvidence(policy, bindings, catalogue) {
  const errors = [];
  const ids = new Set(policy.requirements.map(r => r.id));
  const evidence = new Map(catalogue.items.map(e => [e.id,e]));
  const seen = new Set();
  const items = [];
  if (bindings.kind !== 'NorthStarEvidenceBindings' || bindings.apiVersion !== 'plasma.spec/v1') errors.push('invalid North Star evidence binding identity');
  for (const b of bindings.bindings || []) {
    if (!ids.has(b.requirement) || seen.has(b.requirement)) errors.push('unknown or duplicate requirement binding: '+b.requirement);
    seen.add(b.requirement);
    if (!Array.isArray(b.evidenceIds) || !b.evidenceIds.length || new Set(b.evidenceIds).size !== b.evidenceIds.length) errors.push('invalid evidence links: '+b.requirement);
    if (typeof b.remainingProof !== 'string' || !b.remainingProof.trim()) errors.push('missing proof gap: '+b.requirement);
    const links = (b.evidenceIds || []).map(id => {
      const e = evidence.get(id);
      if (!e) errors.push('unknown evidence: '+id);
      return { id, name:e?.name || id, catalogueStatus:e?.verification?.status || 'unlinked' };
    });
    items.push({requirement:b.requirement, links, remainingProof:b.remainingProof, conformance:'UNQUALIFIED'});
  }
  if ([...ids].some(id => !seen.has(id))) errors.push('missing requirement evidence binding');
  return {errors, report:{policyVersion:policy.version,policyStatus:policy.status,qualification:'No system-wide proof inferred from catalogue links',items}};
}
