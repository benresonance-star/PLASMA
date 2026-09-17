import { createHash } from 'node:crypto';

// Execution history is stored beside revisions, never inside semantic World State.
export function createExecutionStore({ db, snapshot, canonical, hash, fail }) {
  db.exec(`CREATE TABLE IF NOT EXISTS execution_artifacts (
    id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS execution_runs (
    id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS execution_proposals (
    id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proposal_receipts (
    actor TEXT, request TEXT, digest TEXT NOT NULL, proposal TEXT NOT NULL,
    PRIMARY KEY(actor, request));`);
  const string = value => typeof value === 'string' && value.trim().length > 0;
  const revisionNumber = ref => {
    if (!/^R(0|[1-9]\d*)$/.test(ref) || !Number.isSafeInteger(Number(ref.slice(1)))) fail('INVALID_REVISION');
    return Number(ref.slice(1));
  };
  function read(table, id) {
    const row = db.prepare(`SELECT body,digest FROM ${table} WHERE id=?`).get(id);
    if (!row) fail('HISTORY_NOT_FOUND');
    const value = JSON.parse(row.body);
    if (hash(value) !== row.digest || value.id !== id) fail('CORRUPT_EXECUTION_HISTORY');
    return value;
  }
  function insert(table, value) {
    const digest = hash(value), body = canonical(value);
    const previous = db.prepare(`SELECT digest FROM ${table} WHERE id=?`).get(value.id);
    if (previous) {
      if (previous.digest !== digest) fail('IMMUTABLE_RECORD');
      return read(table, value.id);
    }
    db.prepare(`INSERT INTO ${table} VALUES (?,?,?)`).run(value.id, body, digest);
    return structuredClone(value);
  }
  const artifact = id => read('execution_artifacts', id);
  const run = id => read('execution_runs', id);
  const proposal = id => read('execution_proposals', id);
  function references(record) {
    const refs = [...record.artifacts, ...record.evidence, ...record.logs, ...record.replay.requiredArtifacts];
    for (const input of record.inputs) {
      if (input.revision !== record.worldRevision || !string(input.entityRef) || !string(input.artifactRef)) fail('INVALID_RUN_INPUT');
      refs.push(input.artifactRef);
    }
    for (const ref of refs) { if (!string(ref)) fail('INVALID_ARTIFACT_REF'); artifact(ref); }
  }
  function validateRun(record) {
    const allowed = new Set(['contractVersion','id','kind','workItemId','status','worldRevision','producer','inputs',
      'parameters','assumptions','execution','artifacts','evidence','logs','proposals','replay','rerunOf']);
    if (Object.keys(record).some(k => !allowed.has(k)) || record.contractVersion !== 'PLS-RUN-01/0.1.0' ||
        !string(record.id) || !string(record.kind) || !string(record.workItemId) ||
        !['completed','failed','cancelled','superseded'].includes(record.status) ||
        !['capabilityId','implementation','version'].every(k => string(record.producer?.[k])) ||
        !record.parameters || Array.isArray(record.parameters) || typeof record.parameters !== 'object' ||
        !['inputs','assumptions','artifacts','evidence','logs','proposals'].every(k => Array.isArray(record[k])) ||
        !record.inputs.length || !Array.isArray(record.replay?.requiredArtifacts) ||
        !['inspect_only','rerunnable','reproducible'].includes(record.replay.mode)) fail('INVALID_RUN');
    const start = Date.parse(record.execution?.startedAt), end = Date.parse(record.execution?.finishedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) fail('INVALID_RUN_TIME');
    snapshot('main', revisionNumber(record.worldRevision));
    if (record.rerunOf) run(record.rerunOf);
    references(record);
    for (const p of record.proposals) {
      if (!string(p.proposalId) || p.runRef !== record.id || p.baseRevision !== record.worldRevision ||
          !Array.isArray(p.transforms) || p.transforms.length !== 1 ||
          !Array.isArray(p.evidenceRefs) || !p.evidenceRefs.length ||
          p.evidenceRefs.some(ref => !record.evidence.includes(ref))) fail('INVALID_RUN_PROPOSAL');
    }
    if (record.status !== 'completed' && record.proposals.length) fail('INVALID_RUN_PROPOSAL');
  }
  function publications(filter) {
    return db.prepare('SELECT id FROM revisions ORDER BY id').all().map(row => snapshot('main', row.id))
      .filter(s => s.event?.provenance && filter(s.event.provenance))
      .map(s => ({ revision: `R${s.revision}`, eventId: `event:R${s.revision}`, ...s.event.provenance }));
  }
  function inspectRun(id, againstRevision = `R${snapshot().revision}`) {
    const record = run(id);
    snapshot('main', revisionNumber(againstRevision));
    references(record);
    return {
      record, historicalRecordIntact: true,
      currentness: { evaluatedAgainst: againstRevision, validForRevision: record.worldRevision,
        scope: 'revision_identity_only',
        state: againstRevision === record.worldRevision ? 'current' : 'stale',
        staleBecause: againstRevision === record.worldRevision ? [] : ['world_revision_changed'] },
      inputSnapshot: snapshot('main', revisionNumber(record.worldRevision)),
      artifacts: [...new Set([...record.inputs.map(x => x.artifactRef), ...record.artifacts,
        ...record.evidence, ...record.logs, ...record.replay.requiredArtifacts])].map(artifact),
      publications: publications(p => p.runRef === id),
    };
  }
  function saveProposal(actor, payload, worldRequest, idempotencyKey) {
    const digest = hash(payload);
    db.exec('BEGIN IMMEDIATE');
    try {
      const prior = db.prepare('SELECT digest,proposal FROM proposal_receipts WHERE actor=? AND request=?').get(actor.id, idempotencyKey);
      if (prior) {
        if (prior.digest !== digest) fail('REQUEST_ID_REUSED');
        const saved = proposal(prior.proposal);
        db.exec('COMMIT'); return saved;
      }
      snapshot('main', revisionNumber(payload.baseRevision));
      for (const ref of payload.evidenceRefs ?? []) artifact(ref);
      if (payload.runRef) {
        const record = run(payload.runRef);
        if (record.status !== 'completed' || record.worldRevision !== payload.baseRevision ||
            !record.proposals.some(p => hash(p) === digest)) fail('RUN_PROPOSAL_MISMATCH');
      }
      const saved = insert('execution_proposals', { id: payload.proposalId, actorId: actor.id,
        payload, worldRequest, transformId: `transform:${payload.proposalId}:0` });
      db.prepare('INSERT INTO proposal_receipts VALUES (?,?,?,?)').run(actor.id, idempotencyKey, digest, saved.id);
      db.exec('COMMIT'); return saved;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  // Validate retained execution history when reopening or verifying a recovery copy.
  for (const table of ['execution_artifacts','execution_runs','execution_proposals']) {
    for (const row of db.prepare(`SELECT id FROM ${table}`).all()) read(table, row.id);
  }
  for (const row of db.prepare('SELECT id FROM execution_runs').all()) validateRun(run(row.id));
  return Object.freeze({
    revisionNumber, artifact, run, proposal, publications, inspectRun, saveProposal,
    putArtifact({ mediaType, content }) {
      if (!string(mediaType) || typeof content !== 'string' || Buffer.byteLength(content) > 4 * 1024 * 1024) fail('INVALID_ARTIFACT');
      const digest = createHash('sha256').update(mediaType + '\0' + content).digest('hex');
      return insert('execution_artifacts', { id: `sha256:${digest}`, mediaType, content });
    },
    recordRun(record) {
      const copy = structuredClone(record); canonical(copy); validateRun(copy);
      return insert('execution_runs', copy);
    },
  });
}
