import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {copyFileSync,constants,unlinkSync,openSync,closeSync,fsyncSync} from 'node:fs';
import { createExecutionStore } from './execution.mjs';

const copy = x => structuredClone(x);
export class WorldError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new WorldError(code); };
// Bounded reference encoding; this is not the frozen six-contract encoding.
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  fail('INVALID_DATA');
}
const hash = x => createHash('sha256').update(canonical(x)).digest('hex');

/** Trusted host callbacks only. Clients receive a session bound to an authenticated
 * principal; they must never receive this factory, policy callbacks or DB access. */
export function openWorld({ filename, initialState, domains, authorize, fault = () => {} }) {
  if (typeof authorize !== 'function') fail('AUTHORITY_REQUIRED');
  const registry = new Map(Object.entries(domains).map(([name, domain]) => [name, Object.freeze({...domain})]));
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
  db.exec(`CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY, parent INTEGER REFERENCES revisions(id), body TEXT NOT NULL, digest TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS heads (branch TEXT PRIMARY KEY, revision INTEGER NOT NULL REFERENCES revisions(id));
    CREATE TABLE IF NOT EXISTS receipts (actor TEXT, branch TEXT, request TEXT, digest TEXT NOT NULL, body TEXT NOT NULL,
      PRIMARY KEY(actor, branch, request));`);
  if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') { db.close(); fail('CORRUPT_STORE'); }
  if (!db.prepare('SELECT 1 FROM heads').get()) {
    if (!initialState) { db.close(); fail('INITIAL_STATE_REQUIRED'); }
    const body = { state: copy(initialState), event: null, evidence: [], representations: [] };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO revisions VALUES (0,NULL,?,?)').run(canonical(body), hash(body));
      db.prepare("INSERT INTO heads VALUES ('main',0)").run();
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  function snapshot(branch = 'main', revision) {
    const id = revision ?? db.prepare('SELECT revision FROM heads WHERE branch=?').get(branch)?.revision;
    const row = db.prepare('SELECT * FROM revisions WHERE id=?').get(id ?? -1);
    if (!row) fail('REVISION_NOT_FOUND');
    const body = JSON.parse(row.body);
    if (hash(body) !== row.digest) fail('CORRUPT_REVISION');
    return { branch, revision: row.id, parent: row.parent, ...body };
  }
  // Detect corrupt historical records as well as the current head on reopen.
  try { for (const row of db.prepare('SELECT id FROM revisions').all()) snapshot('main', row.id); }
  catch (error) { db.close(); throw error; }
  function permission(actor, request, phase) {
    const capability = authorize(copy(actor), copy(request), phase);
    if (!capability || typeof capability.then === 'function') fail('DENIED');
    return copy(capability);
  }
  function prepare(actor, request, phase) {
    const capability = permission(actor, request, phase);
    const current = snapshot(request.branch);
    if (current.revision !== request.baseRevision) fail('STALE_READ');
    const domain = registry.get(request.domain);
    if (!domain?.version || typeof domain.evaluate !== 'function') fail('DOMAIN_UNAVAILABLE');
    const result = domain.evaluate(copy(current), copy(request.payload), capability);
    if (!result || result.status !== 'pass' || !Array.isArray(result.evidence) || !result.evidence.length ||
        !Array.isArray(result.representations)) fail('HARD_INVARIANT_FAILED');
    canonical(result); // Reject asynchronous evaluators and unsupported values.
    return { current, result: copy(result), version: domain.version };
  }
  function input(request) {
    const value = copy(request);
    if (!value || !['requestId','branch','domain'].every(k => typeof value[k] === 'string' && value[k].length > 0 && value[k].length <= 128) ||
        !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0 ||
        Object.keys(value).some(k => !['requestId','branch','domain','baseRevision','payload'].includes(k))) fail('INVALID_REQUEST');
    if (canonical(value).length > 1024 * 1024) fail('RESOURCE_LIMIT');
    return value;
  }
  let execution;
  try { execution = createExecutionStore({ db, snapshot, canonical, hash, fail }); }
  catch (error) { db.close(); throw error; }
  return Object.freeze({
    snapshot,
    // Trusted executor/host only; never give this writer to capability clients.
    execution,
    backup(filename) {
      // Reserve a new destination exclusively, including when an empty file exists.
      closeSync(openSync(filename,'wx'));
      try {
        db.prepare('VACUUM INTO ?').run(filename);
        const verified = openWorld({filename,domains:Object.fromEntries(registry),authorize});
        let revision;
        try { revision=verified.snapshot().revision; } finally { verified.close(); }
        const fd=openSync(filename,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
        return {revision};
      }catch(error){unlinkSync(filename);throw error;}
    },
    session(principal, proposalId = null) {
      const actor = copy(principal);
      if (!actor || typeof actor.id !== 'string' || !actor.id.length) fail('DENIED');
      const proposal = proposalId === null ? null : execution.proposal(proposalId);
      const provenance = proposal ? { proposalId: proposal.id, transformId: proposal.transformId,
        runRef: proposal.payload.runRef ?? null, evidenceRefs: proposal.payload.evidenceRefs ?? [] } : null;
      return Object.freeze({
        capability(request, phase) { return permission(actor, input(request), phase); },
        getReceipt(requestId, branch = 'main') {
          const row = db.prepare('SELECT body FROM receipts WHERE actor=? AND branch=? AND request=?').get(actor.id,branch,requestId);
          if (!row) return null;
          const receipt = JSON.parse(row.body), accepted = snapshot(branch, receipt.worldRevision);
          permission(actor, accepted.event.request, 'commit');
          if (accepted.event.actor.id !== actor.id || accepted.event.request.requestId !== requestId ||
              hash(accepted.event.provenance ? { request: accepted.event.request, provenance: accepted.event.provenance } : accepted.event.request) !== receipt.requestDigest) fail('CORRUPT_RECEIPT');
          return { ...receipt, request: accepted.event.request };
        },
        preview(request) {
          const r = input(request);
          return copy(prepare(actor, r, 'preview').result);
        },
        submit(request) {
          const r = input(request);
          if (proposal && hash(r) !== hash({ ...proposal.worldRequest, requestId: r.requestId })) fail('PROPOSAL_CHANGED');
          const digest = hash(provenance ? { request: r, provenance } : r);
          db.exec('BEGIN IMMEDIATE');
          let committed = false;
          try {
            permission(actor, r, 'commit'); // Revocation applies even to receipt replay.
            const prior = db.prepare('SELECT digest,body FROM receipts WHERE actor=? AND branch=? AND request=?').get(actor.id,r.branch,r.requestId);
            if (prior) {
              if (prior.digest !== digest) fail('REQUEST_ID_REUSED');
              const receipt = JSON.parse(prior.body);
              db.exec('COMMIT'); committed = true;
              return receipt;
            }
            const { current, result, version } = prepare(actor, r, 'commit');
            const id = db.prepare('SELECT MAX(id)+1 AS id FROM revisions').get().id;
            const event = { actor, request: r, parent: current.revision, revision: id, evaluator: version,
              candidateDigest: hash(result.state), evidenceDigest: hash(result.evidence),
              ...(provenance ? { provenance } : {}) };
            const body = { state: result.state, event, evidence: result.evidence, representations: result.representations };
            const receipt = { status: 'committed', worldRevision: id, requestDigest: digest };
            fault('before-write');
            db.prepare('INSERT INTO revisions VALUES (?,?,?,?)').run(id,current.revision,canonical(body),hash(body));
            fault('after-revision');
            db.prepare('UPDATE heads SET revision=? WHERE branch=? AND revision=?').run(id,r.branch,current.revision);
            db.prepare('INSERT INTO receipts VALUES (?,?,?,?,?)').run(actor.id,r.branch,r.requestId,digest,canonical(receipt));
            fault('before-commit');
            db.exec('COMMIT'); committed = true;
            fault('after-commit'); // A lost response is reconciled by retrying the same request.
            return copy(receipt);
          } catch (error) {
            if (!committed) db.exec('ROLLBACK');
            throw error;
          }
        }
      });
    },
    close() { db.close(); }
  });
}

/** Restore into a NEW path only. Preserve the original and recovery copy on error. */
export function restoreWorld({backupFilename,filename,domains,authorize}) {
  copyFileSync(backupFilename,filename,constants.COPYFILE_EXCL);
  try {
    const restored=openWorld({filename,domains,authorize});
    try{return {revision:restored.snapshot().revision};}finally{restored.close();}
  }catch(error){unlinkSync(filename);throw error;}
}
