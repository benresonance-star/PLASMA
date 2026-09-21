/* PLS-KERNEL-01 persistent browser runtime v0.2
 * Persistent semantic kernel for the RC-02 direct-manipulation slice.
 * Pointer feedback stays local. Released proposals and accepted commits cross
 * the governed seven-primitive transaction boundary and are durably serialized.
 */
(() => {
  const VERSION = 'PLS-KERNEL-01/persistent-runtime/0.2.0';
  const CONTRACT = 'PLS-KERNEL-01/0.1.0';
  const KERNEL_SCHEMA = 'plasma-kernel-runtime/0.2.0';
  const STORE_SCHEMA = 'plasma-kernel-store/0.2.0';
  const STORAGE_KEY = 'plasma-kernel-runtime-v0.2';
  const BACKUP_KEY = 'plasma-kernel-runtime-v0.2.backup';
  const LEGACY_KEY = 'plasma-kernel-live-v0.1';

  const clone = value => value == null ? value : structuredClone(value);
  const now = () => new Date().toISOString();
  const id = prefix => `${prefix}:${crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const stableString = value => JSON.stringify(value);
  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
  }

  function baseKernel() {
    const createdAt = now();
    return {
      schema: KERNEL_SCHEMA,
      contract: CONTRACT,
      runtimeVersion: VERSION,
      branch: { id: 'main', headRevision: 'R0' },
      revisionCounter: 0,
      entities: [
        { id: 'W17', type: 'Boundary', lifecycle: 'active', schemaVersion: '1.0.0', createdBy: 'system', createdAt },
        { id: 'B03', type: 'Space', lifecycle: 'active', schemaVersion: '1.0.0', createdBy: 'system', createdAt },
        { id: 'C04', type: 'Space', lifecycle: 'active', schemaVersion: '1.0.0', createdBy: 'system', createdAt },
      ],
      relations: [
        { id: 'rel:W17:B03', type: 'BOUNDS', source: 'W17', target: 'B03', direction: 'directed', status: 'authoritative', evidence: [] },
        { id: 'rel:W17:C04', type: 'BOUNDS', source: 'W17', target: 'C04', direction: 'directed', status: 'authoritative', evidence: [] },
      ],
      invariants: [
        { id: 'INV-C04-MIN', type: 'hard', scope: ['C04'], expression: 'C04.width_mm >= 1000', enabled: true, priority: 100, sourceEvidence: ['EVID-C04-MIN'] },
        { id: 'INV-B03-PREF', type: 'preference', scope: ['B03'], expression: 'B03.width_mm >= 3600', enabled: true, priority: 10, sourceEvidence: ['EVID-B03-PREF'] },
      ],
      evidence: [
        { id: 'EVID-C04-MIN', type: 'human_assertion', sourceRef: 'RC-02 fixture hard design target', assertion: 'C04 clear width minimum is 1000 mm', confidence: 1, createdAt, createdBy: 'system', lineage: [] },
        { id: 'EVID-B03-PREF', type: 'human_assertion', sourceRef: 'RC-02 fixture design preference', assertion: 'B03 preferred width is at least 3600 mm', confidence: 1, createdAt, createdBy: 'system', lineage: [] },
      ],
      states: {
        R0: {
          revisionId: 'R0', parentRevisionId: null, committedAt: createdAt,
          values: {
            W17: { offset_mm: 0 },
            B03: { width_mm: 3500 },
            C04: { width_mm: 1150 },
          },
          transformRef: null,
          transactionRef: null,
        },
      },
      transforms: [],
      transactions: [],
      events: [],
      pending: null,
      history: [],
      persistence: {
        recoveredFrom: 'bootstrap',
        lastPersistedAt: null,
        generation: 0,
      },
    };
  }

  function migrateLegacy(legacy) {
    const migrated = clone(legacy);
    migrated.schema = KERNEL_SCHEMA;
    migrated.contract = CONTRACT;
    migrated.runtimeVersion = VERSION;
    delete migrated.bridgeVersion;
    migrated.persistence = {
      recoveredFrom: 'legacy-v0.1',
      lastPersistedAt: null,
      generation: 0,
    };
    for (const entity of migrated.entities ?? []) {
      entity.createdBy ??= 'legacy';
      entity.createdAt ??= now();
    }
    for (const rel of migrated.relations ?? []) rel.evidence ??= [];
    for (const inv of migrated.invariants ?? []) {
      if (!inv.sourceEvidence) inv.sourceEvidence = inv.id === 'INV-C04-MIN' ? ['EVID-C04-MIN'] : inv.id === 'INV-B03-PREF' ? ['EVID-B03-PREF'] : [];
    }
    for (const ev of migrated.evidence ?? []) ev.lineage ??= [];
    return migrated;
  }

  function revisionNumber(id) {
    const match = /^R(\d+)$/.exec(id ?? '');
    return match ? Number(match[1]) : -1;
  }

  function validateKernel(candidate) {
    const errors = [];
    if (!candidate || candidate.schema !== KERNEL_SCHEMA) errors.push('KERNEL_SCHEMA_MISMATCH');
    if (candidate?.contract !== CONTRACT) errors.push('KERNEL_CONTRACT_MISMATCH');
    const ids = new Set((candidate?.entities ?? []).map(x => x.id));
    if (ids.size !== (candidate?.entities ?? []).length) errors.push('ENTITY_ID_DUPLICATE');
    for (const rel of candidate?.relations ?? []) {
      if (!ids.has(rel.source) || !ids.has(rel.target)) errors.push(`RELATION_DANGLING:${rel.id}`);
    }
    const head = candidate?.branch?.headRevision;
    if (!head || !candidate?.states?.[head]) errors.push('HEAD_REVISION_MISSING');
    let cursor = head;
    const seen = new Set();
    while (cursor && candidate?.states?.[cursor]) {
      if (seen.has(cursor)) { errors.push('REVISION_CYCLE'); break; }
      seen.add(cursor);
      cursor = candidate.states[cursor].parentRevisionId;
    }
    const maxRevision = Math.max(0, ...Object.keys(candidate?.states ?? {}).map(revisionNumber));
    if ((candidate?.revisionCounter ?? -1) < maxRevision) errors.push('REVISION_COUNTER_BEHIND');
    if (!candidate?.invariants?.some(x => x.id === 'INV-C04-MIN' && x.type === 'hard')) errors.push('HARD_INVARIANT_MISSING');
    if (!candidate?.states?.R0) errors.push('ROOT_REVISION_MISSING');
    return { ok: errors.length === 0, errors };
  }

  function envelopeFor(kernel, reason) {
    const payload = clone(kernel);
    payload.persistence ??= {};
    const generation = Number(payload.persistence.generation || 0) + 1;
    const savedAt = now();
    payload.persistence = {
      ...payload.persistence,
      lastPersistedAt: savedAt,
      generation,
      lastReason: reason,
    };
    const body = {
      schema: STORE_SCHEMA,
      contract: CONTRACT,
      runtimeVersion: VERSION,
      generation,
      savedAt,
      headRevision: payload.branch.headRevision,
      kernel: payload,
    };
    return { ...body, checksum: fnv1a(stableString(body)) };
  }

  function validateEnvelope(envelope) {
    if (!envelope || envelope.schema !== STORE_SCHEMA || envelope.contract !== CONTRACT) return { ok: false, errors: ['STORE_SCHEMA_OR_CONTRACT'] };
    const { checksum, ...body } = envelope;
    if (checksum !== fnv1a(stableString(body))) return { ok: false, errors: ['STORE_CHECKSUM'] };
    const kernelValidation = validateKernel(envelope.kernel);
    if (!kernelValidation.ok) return kernelValidation;
    if (envelope.headRevision !== envelope.kernel.branch.headRevision) return { ok: false, errors: ['STORE_HEAD_MISMATCH'] };
    return { ok: true, errors: [] };
  }

  function parseStored(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function loadFromStorage() {
    const diagnostics = [];
    try {
      const primary = parseStored(localStorage.getItem(STORAGE_KEY));
      if (primary) {
        const validation = validateEnvelope(primary);
        if (validation.ok) {
          primary.kernel.persistence = { ...primary.kernel.persistence, recoveredFrom: 'primary' };
          return { kernel: primary.kernel, diagnostics, source: 'primary' };
        }
        diagnostics.push({ source: 'primary', errors: validation.errors });
      }
      const backup = parseStored(localStorage.getItem(BACKUP_KEY));
      if (backup) {
        const validation = validateEnvelope(backup);
        if (validation.ok) {
          backup.kernel.persistence = { ...backup.kernel.persistence, recoveredFrom: 'backup' };
          diagnostics.push({ source: 'primary', action: 'recovered-backup' });
          return { kernel: backup.kernel, diagnostics, source: 'backup' };
        }
        diagnostics.push({ source: 'backup', errors: validation.errors });
      }
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const legacy = parseStored(legacyRaw);
        if (legacy?.contract === CONTRACT && legacy?.schema === 'plasma-kernel-live/0.1.0') {
          const migrated = migrateLegacy(legacy);
          const validation = validateKernel(migrated);
          if (validation.ok) return { kernel: migrated, diagnostics: [...diagnostics, { source: 'legacy', action: 'migrated' }], source: 'legacy' };
          diagnostics.push({ source: 'legacy', errors: validation.errors });
        }
      }
    } catch (error) {
      diagnostics.push({ source: 'storage', errors: [String(error?.message ?? error)] });
    }
    return { kernel: baseKernel(), diagnostics, source: 'bootstrap' };
  }

  let { kernel, diagnostics: recoveryDiagnostics, source: recoverySource } = loadFromStorage();
  let lastTelemetry = null;
  let telemetrySequence = 0;
  let lastPersistResult = { ok: recoverySource !== 'bootstrap', source: recoverySource, diagnostics: clone(recoveryDiagnostics) };

  function persist(reason = 'unspecified') {
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw) localStorage.setItem(BACKUP_KEY, currentRaw);
      const envelope = envelopeFor(kernel, reason);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      kernel = envelope.kernel;
      lastPersistResult = { ok: true, key: STORAGE_KEY, generation: envelope.generation, headRevision: envelope.headRevision, checksum: envelope.checksum, reason };
      return clone(lastPersistResult);
    } catch (error) {
      lastPersistResult = { ok: false, reason, error: String(error?.message ?? error) };
      return clone(lastPersistResult);
    }
  }

  function currentState() { return kernel.states[kernel.branch.headRevision]; }

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

  function boundTrace() {
    if (kernel.transforms.length > 500) kernel.transforms = kernel.transforms.slice(-500);
    if (kernel.transactions.length > 500) kernel.transactions = kernel.transactions.slice(-500);
    if (kernel.events.length > 2000) kernel.events = kernel.events.slice(-2000);
  }

  function observeTelemetry(rc) {
    lastTelemetry = clone(rc);
    if (!rc || !Number.isFinite(rc.baseWidth) || !Number.isFinite(rc.candidateWidth)) return;
    if (!['preview','conflicted','released','gesture'].includes(rc.phase)) return;
    const { transform, tx, hardFail } = buildCandidate(rc);
    kernel.pending = { transform, transaction: tx, telemetry: clone(rc) };
    if (rc.phase === 'released' || rc.phase === 'conflicted') {
      kernel.transforms.push(transform);
      kernel.transactions.push(tx);
      kernel.events.push({
        id: id('event'), type: hardFail ? 'candidate.conflicted' : 'candidate.released', actor: 'human', timestamp: now(),
        worldBefore: tx.baseRevision, worldAfter: null, transformRef: transform.id,
        outcome: 'previewed', affectedEntities: ['W17','B03','C04'], evidence: transform.evidence,
      });
      boundTrace();
      persist(hardFail ? 'candidate-conflict' : 'candidate-release');
    }
  }

  function commitAcceptedFromApp() {
    const pending = kernel.pending;
    if (!pending || pending.transaction.status !== 'approved') return false;
    if (pending.transaction.baseRevision !== kernel.branch.headRevision) {
      pending.transaction.status = 'conflicted';
      pending.transaction.conflict = 'REVISION_CONFLICT';
      kernel.events.push({ id: id('event'), type: 'transaction.rejected', actor: 'system', timestamp: now(), worldBefore: kernel.branch.headRevision, worldAfter: null, transformRef: pending.transform.id, outcome: 'rejected', affectedEntities: ['W17','B03','C04'], evidence: [] });
      persist('revision-conflict');
      return false;
    }
    const fromRevision = kernel.branch.headRevision;
    const fromState = clone(currentState());
    const revisionId = `R${++kernel.revisionCounter}`;
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
    boundTrace();
    const persisted = persist('commit');
    return persisted.ok;
  }

  function recordUndoFromApp() {
    const current = currentState();
    const previous = kernel.history.pop();
    if (!current || !previous) return false;
    const fromRevision = kernel.branch.headRevision;
    const revisionId = `R${++kernel.revisionCounter}`;
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
    kernel.transforms.push(transform);
    kernel.transactions.push(tx);
    kernel.states[revisionId] = { revisionId, parentRevisionId: fromRevision, committedAt: now(), values: clone(previous.state.values), transformRef: transform.id, transactionRef: tx.id };
    kernel.branch.headRevision = revisionId;
    kernel.events.push({ id: id('event'), type: 'world.revision.committed', actor: 'human', timestamp: now(), worldBefore: fromRevision, worldAfter: revisionId, transformRef: transform.id, outcome: 'committed', affectedEntities: ['W17','B03','C04'], evidence: [] });
    kernel.pending = null;
    boundTrace();
    const persisted = persist('undo');
    return persisted.ok;
  }

  function resetForTest() {
    kernel = baseKernel();
    lastTelemetry = null;
    telemetrySequence = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
    return persist('test-reset');
  }

  function storeStatus() {
    const primary = (() => { try { return parseStored(localStorage.getItem(STORAGE_KEY)); } catch { return null; } })();
    const activeValidation = validateKernel(kernel);
    const primaryValidation = primary ? validateEnvelope(primary) : { ok: false, errors: ['PRIMARY_MISSING'] };
    return {
      runtimeVersion: VERSION,
      storageKey: STORAGE_KEY,
      source: kernel.persistence?.recoveredFrom ?? recoverySource,
      headRevision: kernel.branch.headRevision,
      generation: kernel.persistence?.generation ?? 0,
      valid: activeValidation.ok,
      activeErrors: activeValidation.errors,
      primaryValid: primaryValidation.ok,
      primaryErrors: primaryValidation.errors,
      lastPersistResult: clone(lastPersistResult),
      recoveryDiagnostics: clone(recoveryDiagnostics),
    };
  }

  // Persist migrated/bootstrap state once so a future load has a canonical envelope.
  if (recoverySource === 'legacy' || recoverySource === 'bootstrap') persist(recoverySource === 'legacy' ? 'legacy-migration' : 'bootstrap');

  window.addEventListener('plasma:rc02-telemetry', event => observeTelemetry(event.detail));

  Object.defineProperty(window, 'plasmaKernelLive', {
    configurable: true,
    value: Object.freeze({
      version: VERSION,
      contract: CONTRACT,
      snapshot: () => clone(kernel),
      pending: () => clone(kernel.pending),
      lastTelemetry: () => clone(lastTelemetry),
      commitAcceptedFromApp,
      recordUndoFromApp,
      resetForTest,
      storeStatus,
      validate: () => validateKernel(kernel),
      export: () => JSON.stringify(kernel, null, 2),
      exportStore: () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
    }),
  });
})();