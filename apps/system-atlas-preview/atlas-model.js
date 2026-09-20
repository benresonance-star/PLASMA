export async function loadAtlas() {
  const response = await fetch('./atlas.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Atlas model failed to load: ${response.status}`);
  const data = await response.json();
  return createAtlasModel(data);
}

const keyFor = (type, id) => `${type}:${id}`;
const evidenceStatus = evidence => evidence?.verification?.status || 'unlinked';

export function createAtlasModel(data) {
  const links = Array.isArray(data.links) ? data.links : [];
  const by = {
    component: new Map(data.components.map(x => [x.id, x])),
    relationship: new Map(data.relationships.map(x => [x.id, x])),
    contract: new Map(data.contracts.map(x => [x.id, x])),
    domainLanguage: new Map(data.languages.domain.map(x => [x.id, x])),
    coreLanguage: new Map(data.languages.crossCutting.map(x => [x.id, x])),
    stage: new Map(data.transactions.stages.map(x => [x.id, x])),
    slice: new Map(data.slices.map(x => [x.id, x])),
    evidence: new Map(data.evidence.map(x => [x.id, x])),
    integrationLink: new Map(links.map(x => [x.id, x]))
  };

  const refs = [];
  const push = (type, items) => items.forEach(item => {
    refs.push({
      type,
      id: item.id,
      atlasId: item.atlasId || item.id,
      name: item.name || item.label || item.id,
      summary: item.summary || item.description || item.semantics || item.explanation || '',
      explanation: item.explanation || item.description || item.semantics || item.summary || '',
      raw: item
    });
  });

  push('component', data.components);
  push('relationship', data.relationships);
  push('contract', data.contracts);
  push('domainLanguage', data.languages.domain);
  push('coreLanguage', data.languages.crossCutting);
  push('stage', data.transactions.stages);
  push('slice', data.slices);
  push('evidence', data.evidence);

  const baseRefMap = new Map(refs.map(ref => [keyFor(ref.type, ref.id), ref]));
  const endpointName = endpoint => baseRefMap.get(keyFor(endpoint.type, endpoint.id))?.name || endpoint.id;

  for (const link of links) {
    refs.push({
      type: 'integrationLink',
      id: link.id,
      atlasId: link.id,
      name: `${endpointName(link.from)} → ${endpointName(link.to)}`,
      summary: `${link.role.replaceAll('-', ' ')} · architecture ${link.architectureState}`,
      explanation: link.explanation || `Typed Integration relationship from ${endpointName(link.from)} to ${endpointName(link.to)}.`,
      raw: link
    });
  }

  const refMap = new Map(refs.map(ref => [keyFor(ref.type, ref.id), ref]));
  const linkIndex = new Map();
  const evidenceUsageIndex = new Map();

  for (const link of links) {
    for (const endpoint of [link.from, link.to]) {
      const key = keyFor(endpoint.type, endpoint.id);
      const list = linkIndex.get(key) || [];
      list.push(link);
      linkIndex.set(key, list);
    }
    for (const evidenceRef of link.evidenceRefs || []) {
      const list = evidenceUsageIndex.get(evidenceRef.id) || [];
      list.push({ link, evidenceRef });
      evidenceUsageIndex.set(evidenceRef.id, list);
    }
  }

  function resolve(type, id) {
    return refMap.get(keyFor(type, id)) || null;
  }

  function linksFor(type, id, options = {}) {
    if (type === 'integrationLink') {
      const link = by.integrationLink.get(id);
      return link ? [link] : [];
    }
    const list = linkIndex.get(keyFor(type, id)) || [];
    return list.filter(link => {
      if (options.role && link.role !== options.role) return false;
      if (options.direction === 'out' && !(link.from.type === type && link.from.id === id)) return false;
      if (options.direction === 'in' && !(link.to.type === type && link.to.id === id)) return false;
      return true;
    });
  }

  function otherRef(link, type, id) {
    const isFrom = link.from.type === type && link.from.id === id;
    return resolve(isFrom ? link.to.type : link.from.type, isFrom ? link.to.id : link.from.id);
  }

  function related(type, id, options = {}) {
    if (type === 'integrationLink') {
      const link = by.integrationLink.get(id);
      if (!link) return [];
      const endpointRefs = [resolve(link.from.type, link.from.id), resolve(link.to.type, link.to.id)]
        .filter(Boolean)
        .map(ref => ({ link, ref }));
      const evidenceRefs = (link.evidenceRefs || [])
        .map(item => resolve('evidence', item.id))
        .filter(Boolean)
        .map(ref => ({ link, ref }));
      return [...endpointRefs, ...evidenceRefs];
    }
    return linksFor(type, id, options)
      .map(link => ({ link, ref: otherRef(link, type, id) }))
      .filter(item => item.ref);
  }

  function evidenceUsers(evidenceId) {
    return (evidenceUsageIndex.get(evidenceId) || []).map(({ link, evidenceRef }) => ({
      link,
      evidenceRef,
      ref: resolve('integrationLink', link.id)
    }));
  }

  function deriveEvidenceCoverage(link) {
    const refs = Array.isArray(link?.evidenceRefs) ? link.evidenceRefs : [];
    const requiredRefs = refs.filter(ref => ref.requirement === 'required');
    const supportingRefs = refs.filter(ref => ref.requirement === 'supporting');
    const required = requiredRefs.map(ref => ({ ref, evidence: by.evidence.get(ref.id) })).filter(x => x.evidence);
    const supporting = supportingRefs.map(ref => ({ ref, evidence: by.evidence.get(ref.id) })).filter(x => x.evidence);
    const statuses = required.map(x => evidenceStatus(x.evidence));

    const counts = {
      required: required.length,
      verified: statuses.filter(x => x === 'verified').length,
      linked: statuses.filter(x => x === 'linked').length,
      stale: statuses.filter(x => x === 'stale').length,
      failed: statuses.filter(x => x === 'failed').length,
      unlinked: statuses.filter(x => x === 'unlinked').length,
      superseded: statuses.filter(x => x === 'superseded').length,
      supporting: supporting.length,
      supportingVerified: supporting.filter(x => evidenceStatus(x.evidence) === 'verified').length
    };

    let state = 'unlinked';
    const policy = link?.evidencePolicy || { mode: 'all-required' };

    if (!required.length) {
      state = link?.architectureState === 'planned' ? 'not-required' : 'unlinked';
    } else if (counts.failed > 0) {
      state = 'failed';
    } else if (counts.stale > 0 || counts.superseded > 0) {
      state = 'stale';
    } else if (policy.mode === 'any-required') {
      state = counts.verified > 0 ? 'verified' :
        (counts.linked > 0 ? 'partial' : 'unlinked');
    } else if (policy.mode === 'threshold') {
      const minimum = Math.max(1, Number(policy.minimumVerified) || required.length);
      state = counts.verified >= minimum ? 'verified' :
        ((counts.verified + counts.linked) > 0 ? 'partial' : 'unlinked');
    } else {
      state = counts.verified === required.length ? 'verified' :
        ((counts.verified + counts.linked) > 0 ? 'partial' : 'unlinked');
    }

    return {
      state,
      policy,
      ...counts,
      refs,
      requiredItems: required,
      supportingItems: supporting
    };
  }

  function integrationCoverage(sliceId, rowRef) {
    return links.find(link =>
      link.role === 'exercises' &&
      link.from.type === 'slice' &&
      link.from.id === sliceId &&
      link.to.type === rowRef.type &&
      link.to.id === rowRef.id
    ) || null;
  }

  function integrationInsights() {
    const rows = data.integration?.matrixRows || [];
    const slices = data.slices || [];
    const rowCoverage = rows.map(row => {
      const coveredBy = slices
        .map(slice => ({ slice, link: integrationCoverage(slice.id, row.ref) }))
        .filter(item => item.link);
      return { row, coveredBy };
    });
    const partialOrPlanned = links.filter(link =>
      link.role === 'exercises' && (link.architectureState === 'partial' || link.architectureState === 'planned')
    );
    const unlinkedEvidence = data.evidence.filter(item => evidenceStatus(item) === 'unlinked');
    const failingRelationships = links
      .filter(link => link.role === 'exercises')
      .map(link => ({ link, coverage: deriveEvidenceCoverage(link) }))
      .filter(item => item.coverage.state === 'failed' || item.coverage.state === 'stale');
    const slicesWithoutScenario = slices.filter(slice => !(slice.integrationEvidence || []).length);
    return {
      uncovered: rowCoverage.filter(item => item.coveredBy.length === 0),
      singleSlice: rowCoverage.filter(item => item.coveredBy.length === 1),
      partialOrPlanned,
      unlinkedEvidence,
      failingRelationships,
      slicesWithoutScenario
    };
  }

  function search(query, limit = 12) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const normalize = value => String(value || '').toLowerCase().replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim();
    const normalizedQuery = normalize(query);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return refs
      .map(ref => {
        const raw = ref.raw;
        const graphTerms = related(ref.type, ref.id).flatMap(({ link, ref: linked }) => {
          const coverage = deriveEvidenceCoverage(link);
          return [
            linked.name,
            linked.atlasId,
            link.role,
            link.architectureState,
            coverage.state,
            link.explanation,
            ...(link.evidenceRefs || []).map(evidenceRef => by.evidence.get(evidenceRef.id)?.name)
          ];
        });
        const primaryHaystack = [
          ref.name,
          ref.atlasId,
          ref.summary,
          ref.explanation,
          raw.kind,
          raw.authority,
          raw.owner,
          raw.maturity,
          raw.domain,
          raw.declaredState,
          raw.evidenceState,
          raw.verification?.status,
          raw.verification?.method,
          raw.claim,
          ...(raw.tags || []),
          ...(raw.types || []),
          ...(raw.verbs || []),
          ...(raw.constraints || []),
          ...(raw.supports || []),
          ...(raw.flow || []),
          ...(raw.proves || []),
          ...(raw.keySystems || []),
          ...(raw.evidenceRefs || []).map(item => by.evidence.get(item.id)?.name)
        ].filter(Boolean).join(' ').toLowerCase();
        const graphHaystack = graphTerms.filter(Boolean).join(' ').toLowerCase();
        const normalizedName = normalize(ref.name);
        const normalizedId = normalize(ref.id);
        const exactName = (normalizedName === normalizedQuery || normalizedId === normalizedQuery) ? 30 : 0;
        const starts = (normalizedName.startsWith(normalizedQuery) || normalizedId.startsWith(normalizedQuery)) ? 12 : 0;
        const tokenScore = tokens.reduce((score, token) =>
          score + (primaryHaystack.includes(token) ? 3 : 0) + (graphHaystack.includes(token) ? 1 : 0), 0);
        return { ref, score: exactName + starts + tokenScore };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || String(a.ref.name || '').localeCompare(String(b.ref.name || '')))
      .slice(0, limit)
      .map(x => x.ref);
  }

  return {
    data,
    by,
    refs,
    links,
    resolve,
    linksFor,
    related,
    evidenceUsers,
    deriveEvidenceCoverage,
    integrationCoverage,
    integrationInsights,
    search
  };
}

export function routeForRef(ref) {
  if (!ref) return '#overview';
  if (ref.type === 'integrationLink') return `#integration/link/${encodeURIComponent(ref.id)}`;
  const prefix = {
    component: 'components',
    relationship: 'overview/relationship',
    contract: 'contracts',
    domainLanguage: 'languages/domain',
    coreLanguage: 'languages/core',
    stage: 'transactions/stage',
    slice: 'slices',
    evidence: 'evidence'
  }[ref.type];
  if (!prefix) return '#overview';
  return `#${prefix}/${encodeURIComponent(ref.id)}`;
}

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  const view = parts[0] || 'overview';

  if (view === 'overview' && parts[1] === 'component') return { view, type: 'component', id: parts[2] || null };
  if (view === 'overview' && parts[1] === 'relationship') return { view, type: 'relationship', id: parts[2] || null };
  if (view === 'integration' && parts[1] === 'link') return { view, type: 'integrationLink', id: parts[2] || null };
  if (view === 'integration' && parts[1] && parts[2]) return { view, type: parts[1], id: parts[2] };
  if (view === 'languages' && parts[1] === 'domain') return { view, type: 'domainLanguage', id: parts[2] || null };
  if (view === 'languages' && parts[1] === 'core') return { view, type: 'coreLanguage', id: parts[2] || null };
  if (view === 'transactions' && parts[1] === 'stage') return { view, type: 'stage', id: parts[2] || null };
  if (view === 'components') return { view, type: 'component', id: parts[1] || null };
  if (view === 'contracts') return { view, type: 'contract', id: parts[1] || null };
  if (view === 'slices') return { view, type: 'slice', id: parts[1] || null };
  if (view === 'evidence') return { view, type: 'evidence', id: parts[1] || null };
  return { view: ['overview','integration','languages','transactions','components','contracts','slices','evidence'].includes(view) ? view : 'overview', type: null, id: null };
}

export function routeForSelection(type, id, currentView = 'overview') {
  if (!type || !id) return `#${currentView}`;
  if (type === 'integrationLink') return `#integration/link/${encodeURIComponent(id)}`;
  if (currentView === 'integration') return `#integration/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  if (type === 'component') return currentView === 'overview' ? `#overview/component/${encodeURIComponent(id)}` : `#components/${encodeURIComponent(id)}`;
  if (type === 'relationship') return `#overview/relationship/${encodeURIComponent(id)}`;
  if (type === 'domainLanguage') return `#languages/domain/${encodeURIComponent(id)}`;
  if (type === 'coreLanguage') return `#languages/core/${encodeURIComponent(id)}`;
  if (type === 'stage') return `#transactions/stage/${encodeURIComponent(id)}`;
  if (type === 'contract') return `#contracts/${encodeURIComponent(id)}`;
  if (type === 'slice') return `#slices/${encodeURIComponent(id)}`;
  if (type === 'evidence') return `#evidence/${encodeURIComponent(id)}`;
  return `#${currentView}`;
}
