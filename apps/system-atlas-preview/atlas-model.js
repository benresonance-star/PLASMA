export async function loadAtlas() {
  const response = await fetch('./atlas.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Atlas model failed to load: ${response.status}`);
  const data = await response.json();
  return createAtlasModel(data);
}

const keyFor = (type, id) => `${type}:${id}`;

export function createAtlasModel(data) {
  const by = {
    component: new Map(data.components.map(x => [x.id, x])),
    relationship: new Map(data.relationships.map(x => [x.id, x])),
    contract: new Map(data.contracts.map(x => [x.id, x])),
    domainLanguage: new Map(data.languages.domain.map(x => [x.id, x])),
    coreLanguage: new Map(data.languages.crossCutting.map(x => [x.id, x])),
    stage: new Map(data.transactions.stages.map(x => [x.id, x])),
    slice: new Map(data.slices.map(x => [x.id, x])),
    evidence: new Map(data.evidence.map(x => [x.id, x]))
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

  const refMap = new Map(refs.map(ref => [keyFor(ref.type, ref.id), ref]));
  const links = Array.isArray(data.links) ? data.links : [];
  const linkIndex = new Map();
  for (const link of links) {
    for (const endpoint of [link.from, link.to]) {
      const key = keyFor(endpoint.type, endpoint.id);
      const list = linkIndex.get(key) || [];
      list.push(link);
      linkIndex.set(key, list);
    }
  }

  function resolve(type, id) {
    return refMap.get(keyFor(type, id)) || null;
  }

  function linksFor(type, id, options = {}) {
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
    return linksFor(type, id, options)
      .map(link => ({ link, ref: otherRef(link, type, id) }))
      .filter(item => item.ref);
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
    const unlinkedEvidence = data.evidence.filter(item => item.state === 'unlinked');
    const slicesWithoutScenario = slices.filter(slice => !(slice.integrationEvidence || []).length);
    return {
      uncovered: rowCoverage.filter(item => item.coveredBy.length === 0),
      singleSlice: rowCoverage.filter(item => item.coveredBy.length === 1),
      partialOrPlanned,
      unlinkedEvidence,
      slicesWithoutScenario
    };
  }

  function search(query, limit = 12) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return refs
      .map(ref => {
        const raw = ref.raw;
        const graphTerms = related(ref.type, ref.id).flatMap(({ link, ref: linked }) => [
          linked.name,
          linked.atlasId,
          link.role,
          link.architectureState,
          link.evidenceState,
          link.explanation
        ]);
        const haystack = [
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
          ...(raw.tags || []),
          ...(raw.types || []),
          ...(raw.verbs || []),
          ...(raw.constraints || []),
          ...(raw.supports || []),
          ...(raw.flow || []),
          ...(raw.proves || []),
          ...(raw.keySystems || []),
          ...graphTerms
        ].filter(Boolean).join(' ').toLowerCase();
        const exactName = String(ref.name || '').toLowerCase() === q ? 12 : 0;
        const starts = String(ref.name || '').toLowerCase().startsWith(q) ? 6 : 0;
        const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
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
    integrationCoverage,
    integrationInsights,
    search
  };
}

export function routeForRef(ref) {
  if (!ref) return '#overview';
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
