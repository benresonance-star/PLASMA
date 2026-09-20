export async function loadAtlas() {
  const response = await fetch('./atlas.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Atlas model failed to load: ${response.status}`);
  const data = await response.json();
  return createAtlasModel(data);
}

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
  const push = (type, items, aliases = []) => items.forEach(item => {
    refs.push({
      type,
      id: item.id,
      atlasId: item.atlasId || item.id,
      name: item.name,
      summary: item.summary || item.description || item.semantics || '',
      explanation: item.explanation || item.description || item.semantics || item.summary || '',
      raw: item,
      aliases
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

  const refMap = new Map(refs.map(ref => [`${ref.type}:${ref.id}`, ref]));

  function resolve(type, id) {
    return refMap.get(`${type}:${id}`) || null;
  }

  function search(query, limit = 12) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return refs
      .map(ref => {
        const raw = ref.raw;
        const haystack = [
          ref.name,
          ref.atlasId,
          ref.summary,
          ref.explanation,
          raw.kind,
          raw.authority,
          raw.owner,
          ...(raw.tags || []),
          ...(raw.types || []),
          ...(raw.verbs || []),
          ...(raw.constraints || []),
          ...(raw.supports || [])
        ].filter(Boolean).join(' ').toLowerCase();
        const exactName = ref.name?.toLowerCase() === q ? 12 : 0;
        const starts = ref.name?.toLowerCase().startsWith(q) ? 6 : 0;
        const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
        return { ref, score: exactName + starts + tokenScore };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.ref.name.localeCompare(b.ref.name))
      .slice(0, limit)
      .map(x => x.ref);
  }

  return { data, by, refs, resolve, search };
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
  if (view === 'languages' && parts[1] === 'domain') return { view, type: 'domainLanguage', id: parts[2] || null };
  if (view === 'languages' && parts[1] === 'core') return { view, type: 'coreLanguage', id: parts[2] || null };
  if (view === 'transactions' && parts[1] === 'stage') return { view, type: 'stage', id: parts[2] || null };
  if (view === 'components') return { view, type: 'component', id: parts[1] || null };
  if (view === 'contracts') return { view, type: 'contract', id: parts[1] || null };
  if (view === 'slices') return { view, type: 'slice', id: parts[1] || null };
  if (view === 'evidence') return { view, type: 'evidence', id: parts[1] || null };
  return { view: ['overview','languages','transactions','components','contracts','slices','evidence'].includes(view) ? view : 'overview', type: null, id: null };
}

export function routeForSelection(type, id, currentView = 'overview') {
  if (!type || !id) return `#${currentView}`;
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
