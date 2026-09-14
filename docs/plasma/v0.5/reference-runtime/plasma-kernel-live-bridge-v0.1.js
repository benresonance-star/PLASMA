/* PLS-KERNEL-01 live bridge v0.1
 * Application-boundary adapter for the existing RC-02 direct-manipulation UI.
 * Keeps pointer preview lightweight; expresses released/accepted edits through
 * Entity, State, Relation, Transform, Invariant, Event and Evidence.
 */
(() => {
  const VERSION = 'PLS-KERNEL-01/live-bridge/0.1.0';
  const STORAGE_KEY = 'plasma-kernel-live-v0.1';
  const clone = value => value == null ? value : structuredClone(value);
  const now = () => new Date().toISOString();
  const id = prefix => `${prefix}:${crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

  const baseKernel = () => ({
    schema: 'plasma-kernel-live/0.1.0',
    contract: 'PLS-KERNEL-01/0.1.0',
    bridgeVersion: VERSION,
    branch: { id: 'main', headRevision: 'R0' },
    revisionCounter: 0,
    entities: [
      { id: 'W17', type: 'Boundary', lifecycle: 'active', schemaVersion: '1.0.0' },
      { id: 'B03', type: 'Space', lifecycle: 'active', schemaVersion: '1.0.0' },
      { id: 'C04', type: 'Space', lifecycle: 'active', schemaVersion: '1.0.0' },
    ],
    relations: [
      { id: 'rel:W17:B03', type: 'BOUNDS', source: 'W17', target: 'B03', direction: 'directed', status: 'authoritative' },
      { id: 'rel:W17:C04', type: 'BOUNDS', source: 'W17', target: 'C04', direction: 'directed', status: 'authoritative' },
    ],
    invariants: [
      { id: 'INV-C04-MIN', type: 'hard', scope: ['C04'], expression: 'C04.width_mm >= 1000', enabled: true, priority: 100 },
      { id: 'INV-B03-PREF', type: 'preference', scope: ['B03'], expression: 'B03.width_mm >= 3600', enabled: true, priority: 10 },
    ],
    evidence: [
      { id: 'EVID-C04-MIN', type: 'human_assertion', sourceRef: 'RC-02 fixture hard design target', assertion: 'C04 clear width minimum is 1000 mm', confidence: 1, createdAt: now(), createdBy: 'system' },
      { id: 'EVID-B03-PREF', type: 'human_assertion', sourceRef: 'RC-02 fixture design preference', assertion: 'B03 preferred width is at least 3600 mm', confidence: 1, createdAt: now(), createdBy: 'system' },
    ],
    states: {
      R0: {
        revisionId: 'R0', parentRevisionId: null, committedAt: now(),
        values: {
          W17: { offset_mm: 0 },
          B03: { width_mm: 3500 },
          C04: { width_mm: 1150 },
        },
      },
    },
    transforms: [],
    transactions: [],
    events: [],
    pending: null,
    history: [],
  });

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.schema === 'plasma-kernel-live/0.1.0' && parsed?.contract === 'PLS-KERNEL-01/0.1.0') return parsed;
      }
    } catch {}
    return baseKernel();
  }

  let kernel = load();
  let lastTelemetry = null;
  let telemetrySequence = 0;

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(kernel)); return true; }
    catch { return false; }
  }

  function currentState() {
    return kernel.states[kernel.branch.headRevision];
  }

  function inferBase(rc) {
    const requested = Number(rc.requestedDelta || 0);
    const bedroomBase = Number.isFinite(rc.baseWidth) ? rc.baseWidth : currentState()?.values?.B03?.width_mm ?? 3500;
    let corridorBase = currentState()?.values?.C04?.width_mm;
    if (!Number.isFinite(corridorBase)) {
      corridorBase = rc.mode === 'take' && Number.isFinite(rc.corridorClear) ? rc.corridorClear + requested : Number(rc.corridorClear || 1150);
    }
    return { bedroomBase, corridorBase, wallBase: currentState()?.values?.W17?.offset_mm ?? 0 };
  }

  function evaluate(values) {
    const corridor = values.C04.width_mm;
    const bedroom = values.B03.width_mm;
    const hardMargin = corridor - 1000;
    const prefMargin = bedroom - 3600;
    return [
      { invariantId: 'INV-C04-MIN', status: hardMargin >= 0 ? 'pass' : 'fail', value: { value: corridor, unit: 'mm' }, margin: { value: hardMargin, unit: 'mm' }, confidence: 1, evidence: ['EVID-C04-MIN'], evaluator: 'rc02-local-deterministic' },
      { invariantId: 'INV-B03-PREF', status: prefMargin >= 0 ? 'pass' : 'fail', value: { value: bedroom, unit: 'mm' }, margin: { value: prefMargin, unit: 'mm' }, confidence: 1, evidence: ['EVID-B03-PREF'], evaluator: 'rc02-local-deterministic' },
    ];
  }

  function buildCandidate(rc) {
    const baseRevision = kernel.branch.headRevision;
    const base = inferBase(rc);
    const delta = Number(rc.requestedDelta || 0);
    const mode = rc.mode || 'take';
    const candidateValues = {
      W17: { offset_mm: base.wallBase + delta },
      B03: { width_mm: Number.isFinite(rc.candidateWidth) ? rc.candidateWidth : base.bedroomBase + delta },
      C04: { width_mm: Number.isFinite(rc.corridorClear) ? rc.corridorClear : mode === 'take' ? base.corridorBase - delta : base.corridorBase },
    };
    const results = evaluate(candidateValues);
    const hardFail = results.some(r => r.invariantId === 'INV-C04-MIN' && r.status === 'fail');
    const transform = {
      id: id('transform'), type: 'MoveBoundary', actor: 'human', targets: ['W17'],
      inputs: { delta_mm: delta, mode },
      preconditions: [{ type: 'baseRevision', value: baseRevision }],
      operations: [
        { op: 'SET_STATE', entity: 'W17', key: 'offset_mm', value: candidateValues.W17.offset_mm, unit: 'mm' },
        { op: 'SET_STATE', entity: 'B03', key: 'width_mm', value: candidateValues.B03.width_mm, unit: 'mm' },
        { op: 'SET_STATE', entity: 'C04', key: 'width_mm', value: candidateValues.C04.width_mm, unit: 'mm' },
      ],
      declaredEffects: ['W17', 'B03', 'C04', 'INV-C04-MIN', 'INV-B03-PREF'],
      rationale: 'Direct-manipulation bedroom boundary edit', evidence: ['EVID-C04-MIN', 'EVID-B03-PREF'],
      mode: 'preview', reversibility: 'reversible', createdAt: now(),
    };
    const tx = {
      id: id('tx'), baseRevision, actor: 'human', transforms: [transform.id],
      status: hardFail ? 'conflicted' : 'approved', affectedSet: ['W17', 'B03', 'C04'],
      invariantResults: results, candidateRevision: `candidate:${baseRevision}:${++telemetrySequence}`,
      candidateValues, lifecycle: ['BEGIN','DECLARE','EXPAND','IMPACT','APPLY','DERIVE','EVALUATE','RESOLVE'], createdAt: now(),
    };
    return { transform, tx, hardFail };
  }

  function observeTelemetry(rc) {
    lastTelemetry = clone(rc);
    if (!rc || !Number.isFinite(rc.baseWidth) || !Number.isFinite(rc.candidateWidth)) return;
    if (!['preview','conflicted','released','gesture'].includes(rc.phase)) return;
    const { transform, tx, hardFail } = buildCandidate(rc);
    // Keep a single active candidate; only append the material release/conflict proposal to history.
    kernel.pending = { transform, transaction: tx, telemetry: clone(rc) };
    if (rc.phase === 'released' || rc.phase === 'conflicted') {
      kernel.transforms.push(transform);
      kernel.transactions.push(tx);
      kernel.events.push({
        id: id('event'), type: hardFail ? 'candidate.conflicted' : 'candidate.released', actor: 'human', timestamp: now(),
        worldBefore: tx.baseRevision, worldAfter: null, transformRef: transform.id,
        outcome: 'previewed', affectedEntities: ['W17','B03','C04'], evidence: transform.evidence,
      });
      // Bound the bridge trace; canonical revisions/events remain persistent.
      if (kernel.transforms.length > 200) kernel.transforms = kernel.transforms.slice(-200);
      if (kernel.transactions.length > 200) kernel.transactions = kernel.transactions.slice(-200);
      if (kernel.events.length > 500) kernel.events = kernel.events.slice(-500);
      persist();
    }
  }

  function commitAcceptedFromApp() {
    const pending = kernel.pending;
    if (!pending || pending.transaction.status !== 'approved') return false;
    if (pending.transaction.baseRevision !== kernel.branch.headRevision) {
      pending.transaction.status = 'conflicted';
      pending.transaction.conflict = 'REVISION_CONFLICT';
      kernel.events.push({ id: id('event'), type: 'transaction.rejected', actor: 'system', timestamp: now(), worldBefore: kernel.branch.headRevision, worldAfter: null, transformRef: pending.transform.id, outcome: 'rejected', affectedEntities: ['W17','B03','C04'], evidence: [] });
      persist();
      return false;
    }
    const fromRevision = kernel.branch.headRevision;
    const fromState = clone(currentState());
    const nextNumber = ++kernel.revisionCounter;
    const revisionId = `R${nextNumber}`;
    const values = clone(pending.transaction.candidateValues);
    kernel.states[revisionId] = { revisionId, parentRevisionId: fromRevision, committedAt: now(), values, transformRef: pending.transform.id, transactionRef: pending.transaction.id };
    kernel.history.push({ revisionId: fromRevision, state: fromState });
    pending.transaction.status = 'committed';
    pending.transaction.candidateRevision = revisionId;
    pending.transaction.lifecycle = [...pending.transaction.lifecycle, 'COMMIT', 'EMIT'];
    pending.transform.mode = 'commit';
    kernel.branch.headRevision = revisionId;
    kernel.events.push({
      id: id('event'), type: 'world.revision.committed', actor: 'human', timestamp: now(), worldBefore: fromRevision, worldAfter: revisionId,
      transformRef: pending.transform.id, outcome: 'committed', affectedEntities: ['W17','B03','C04'], evidence: pending.transform.evidence,
    });
    kernel.pending = null;
    persist();
    return true;
  }

  function recordUndoFromApp() {
    const current = currentState();
    const previous = kernel.history.pop();
    if (!current || !previous) return false;
    const fromRevision = kernel.branch.headRevision;
    const nextNumber = ++kernel.revisionCounter;
    const revisionId = `R${nextNumber}`;
    const delta = previous.state.values.W17.offset_mm - current.values.W17.offset_mm;
    const transform = {
      id: id('transform'), type: 'MoveBoundary', actor: 'human', targets: ['W17'], inputs: { delta_mm: delta, mode: 'undo' },
      preconditions: [{ type: 'baseRevision', value: fromRevision }],
      operations: [
        { op: 'SET_STATE', entity: 'W17', key: 'offset_mm', value: previous.state.values.W17.offset_mm, unit: 'mm' },
        { op: 'SET_STATE', entity: 'B03', key: 'width_mm', value: previous.state.values.B03.width_mm, unit: 'mm' },
        { op: 'SET_STATE', entity: 'C04', key: 'width_mm', value: previous.state.values.C04.width_mm, unit: 'mm' },
      ],
      declaredEffects: ['W17','B03','C04'], rationale: 'Undo as inverse Transform', evidence: [], mode: 'commit', reversibility: 'reversible', createdAt: now(),
    };
    const tx = { id: id('tx'), baseRevision: fromRevision, actor: 'human', transforms: [transform.id], status: 'committed', affectedSet: ['W17','B03','C04'], invariantResults: evaluate(previous.state.values), candidateRevision: revisionId, candidateValues: clone(previous.state.values), lifecycle: ['BEGIN','DECLARE','EXPAND','IMPACT','APPLY','DERIVE','EVALUATE','RESOLVE','COMMIT','EMIT'], createdAt: now() };
    kernel.transforms.push(transform); kernel.transactions.push(tx);
    kernel.states[revisionId] = { revisionId, parentRevisionId: fromRevision, committedAt: now(), values: clone(previous.state.values), transformRef: transform.id, transactionRef: tx.id };
    kernel.branch.headRevision = revisionId;
    kernel.events.push({ id: id('event'), type: 'world.revision.committed', actor: 'human', timestamp: now(), worldBefore: fromRevision, worldAfter: revisionId, transformRef: transform.id, outcome: 'committed', affectedEntities: ['W17','B03','C04'], evidence: [] });
    kernel.pending = null;
    persist();
    return true;
  }

  function resetForTest() {
    kernel = baseKernel(); lastTelemetry = null; telemetrySequence = 0; persist();
  }

  window.addEventListener('plasma:rc02-telemetry', event => observeTelemetry(event.detail));

  Object.defineProperty(window, 'plasmaKernelLive', {
    configurable: true,
    value: Object.freeze({
      version: VERSION,
      contract: 'PLS-KERNEL-01/0.1.0',
      snapshot: () => clone(kernel),
      pending: () => clone(kernel.pending),
      lastTelemetry: () => clone(lastTelemetry),
      commitAcceptedFromApp,
      recordUndoFromApp,
      resetForTest,
      export: () => JSON.stringify(kernel, null, 2),
    }),
  });
})();