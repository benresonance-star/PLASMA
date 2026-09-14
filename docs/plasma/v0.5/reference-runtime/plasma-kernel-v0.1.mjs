import crypto from 'node:crypto';

const clone = (x) => structuredClone(x);
const id = (prefix, payload = '') => `${prefix}-${crypto.createHash('sha256').update(String(payload)).digest('hex').slice(0,12)}`;

export class KernelError extends Error {
  constructor(code, message, detail={}) { super(message); this.code=code; this.detail=detail; }
}

export class PlasmaKernel {
  constructor(fixture) {
    this.entities = new Map(fixture.entities.map(x => [x.id, clone(x)]));
    this.states = new Map(fixture.states.map(x => [x.id, clone(x)]));
    this.relations = new Map(fixture.relations.map(x => [x.id, clone(x)]));
    this.invariants = new Map(fixture.invariants.map(x => [x.id, clone(x)]));
    this.evidence = new Map(fixture.evidence.map(x => [x.id, clone(x)]));
    this.revisions = new Map([[fixture.world.revision_id, clone(fixture.world)]]);
    this.branches = new Map([[fixture.branch.id, clone(fixture.branch)]]);
    this.events = [];
  }

  get branch() { return this.branches.get('branch-main'); }
  get headRevision() { return this.branch.head_revision_id; }

  snapshot(revisionId=this.headRevision) {
    const rev = this.revisions.get(revisionId);
    if (!rev) throw new KernelError('REVISION_NOT_FOUND', `Unknown revision ${revisionId}`);
    return clone(rev);
  }

  stateFor(entityId, revision=this.headRevision) {
    const rev = this.snapshot(revision);
    const sid = rev.state_refs[entityId];
    if (!sid) throw new KernelError('STATE_NOT_FOUND', `No state for ${entityId} at ${revision}`);
    return clone(this.states.get(sid));
  }

  beginTransaction({actor, base_revision=this.headRevision}) {
    if (!this.revisions.has(base_revision)) throw new KernelError('REVISION_NOT_FOUND', `Unknown base ${base_revision}`);
    return {
      id: id('tx', `${base_revision}:${actor.id}:${this.events.length}`),
      base_revision,
      actor: clone(actor),
      transforms: [],
      status: 'draft',
      affected_set: [],
      invariant_results: [],
      candidate: null
    };
  }

  declare(tx, transform) {
    if (tx.status !== 'draft') throw new KernelError('TX_STATE', 'Can only declare transforms on draft transaction');
    tx.transforms.push(clone(transform));
    return tx;
  }

  expand(tx) {
    const ops=[];
    for (const t of tx.transforms) {
      if (t.type === 'MoveBoundary') {
        const wall = this.stateFor(t.targets[0], tx.base_revision);
        const bedroom = this.stateFor('B03', tx.base_revision);
        const corridor = this.stateFor('C04', tx.base_revision);
        const d = t.inputs.delta_mm;
        ops.push({op:'SET_STATE', entity:'W17', patch:{offset_mm: wall.values.offset_mm + d}});
        ops.push({op:'SET_STATE', entity:'B03', patch:{width_mm: bedroom.values.width_mm + d}});
        ops.push({op:'SET_STATE', entity:'C04', patch:{width_mm: corridor.values.width_mm - d}});
      } else if (t.type === 'SetState') {
        ops.push({op:'SET_STATE', entity:t.targets[0], patch:clone(t.inputs.patch)});
      } else {
        throw new KernelError('TRANSFORM_UNSUPPORTED', `Unsupported transform ${t.type}`);
      }
    }
    tx.operations = ops;
    return tx;
  }

  impact(tx) {
    const touched = new Set(tx.operations.map(o => o.entity));
    // semantic closure: W17 bounds B03/C04, and invariants scoped to touched entities
    for (const r of this.relations.values()) {
      if (touched.has(r.source) || touched.has(r.target)) { touched.add(r.source); touched.add(r.target); }
    }
    tx.affected_set = [...touched].sort();
    return tx;
  }

  apply(tx) {
    const base = this.snapshot(tx.base_revision);
    const candidate = clone(base);
    candidate.revision_id = `candidate:${tx.id}`;
    candidate.parent_revision_id = tx.base_revision;
    candidate.state_refs = clone(base.state_refs);
    candidate.candidate_states = {};

    for (const op of tx.operations) {
      if (op.op !== 'SET_STATE') throw new KernelError('OP_UNSUPPORTED', op.op);
      const prior = this.stateFor(op.entity, tx.base_revision);
      const next = clone(prior);
      next.id = id('state', `${tx.id}:${op.entity}`);
      next.revision_id = candidate.revision_id;
      next.values = {...next.values, ...clone(op.patch)};
      next.produced_by = tx.transforms[0]?.id;
      candidate.state_refs[op.entity] = next.id;
      candidate.candidate_states[next.id] = next;
    }
    tx.candidate = candidate;
    tx.status = 'evaluating';
    return tx;
  }

  derive(tx) {
    tx.derived = {
      stale: ['repr:W17:mesh','eval:B03:area','eval:C04:width'],
      current: ['entity:site-boundary']
    };
    return tx;
  }

  _candidateState(tx, entityId) {
    const sid = tx.candidate.state_refs[entityId];
    return clone(tx.candidate.candidate_states?.[sid] || this.states.get(sid));
  }

  evaluate(tx) {
    const results=[];
    for (const inv of this.invariants.values()) {
      if (!inv.enabled) continue;
      if (!inv.scope.some(x => tx.affected_set.includes(x))) continue;
      let value, pass;
      if (inv.expression.kind === 'min_value') {
        const st = this._candidateState(tx, inv.expression.entity);
        value = st.values[inv.expression.field];
        pass = value >= inv.expression.min;
      } else throw new KernelError('INV_UNSUPPORTED', inv.expression.kind);
      results.push({
        invariant_id:inv.id,
        type:inv.type,
        status:pass?'pass':'fail',
        value,
        required:inv.expression.min,
        margin:value-inv.expression.min,
        evidence:clone(inv.source_evidence || [])
      });
    }
    tx.invariant_results = results;
    return tx;
  }

  resolve(tx) {
    const hardFails = tx.invariant_results.filter(x => x.type==='hard' && x.status==='fail');
    const softFails = tx.invariant_results.filter(x => x.type!=='hard' && x.status==='fail');
    if (hardFails.length) {
      tx.status='conflicted';
      const baseCorridor=this.stateFor('C04', tx.base_revision).values.width_mm;
      const min=this.invariants.get('INV-C04-MIN-WIDTH').expression.min;
      const maxDelta=baseCorridor-min;
      tx.conflicts=hardFails.map(f => ({
        invariant_id:f.invariant_id,
        cause:tx.affected_set,
        current_value:f.value,
        required_value:f.required,
        explanation:`${f.invariant_id} fails by ${Math.abs(f.margin)} mm`,
        alternatives:[{type:'MoveBoundary',targets:['W17'],inputs:{delta_mm:maxDelta},rationale:'Move to exact hard limit'}]
      }));
    } else {
      tx.status=softFails.length?'approved_with_warning':'approved';
    }
    return tx;
  }

  preview(tx) {
    if (!tx.operations) this.expand(tx);
    if (!tx.affected_set?.length) this.impact(tx);
    if (!tx.candidate) this.apply(tx);
    this.derive(tx); this.evaluate(tx); this.resolve(tx);
    this.events.push({
      id:id('event', `${tx.id}:preview:${this.events.length}`),
      type:'TransactionPreview', actor:clone(tx.actor), timestamp:new Date().toISOString(),
      world_before:tx.base_revision, world_after:null, transform_refs:tx.transforms.map(t=>t.id),
      outcome:'previewed', affected_entities:clone(tx.affected_set), evidence_refs:[]
    });
    return clone(tx);
  }

  commit(tx) {
    if (this.headRevision !== tx.base_revision) throw new KernelError('REVISION_CONFLICT', `Base ${tx.base_revision} is stale; head is ${this.headRevision}`);
    if (!tx.candidate) this.preview(tx);
    if (tx.status === 'conflicted') throw new KernelError('HARD_INVARIANT_FAILED', 'Transaction has hard conflicts', {conflicts:tx.conflicts});
    if (!['approved','approved_with_warning'].includes(tx.status)) throw new KernelError('TX_NOT_APPROVED', `Transaction status ${tx.status}`);

    const n = this.revisions.size;
    const rid = `R${n}`;
    for (const st of Object.values(tx.candidate.candidate_states || {})) {
      const committed=clone(st); committed.revision_id=rid; this.states.set(committed.id, committed);
    }
    const revision = {
      world_id:'PLASMA-WALL-SLICE', revision_id:rid, parent_revision_id:tx.base_revision,
      branch_id:'branch-main', state_refs:clone(tx.candidate.state_refs), committed_at:new Date().toISOString(), transaction_id:tx.id
    };
    this.revisions.set(rid, revision);
    this.branch.head_revision_id=rid;
    tx.status='committed'; tx.candidate_revision=rid;

    const ev={
      id:id('event', `${tx.id}:commit`), type:'TransactionCommitted', actor:clone(tx.actor), timestamp:new Date().toISOString(),
      world_before:tx.base_revision, world_after:rid, transform_refs:tx.transforms.map(t=>t.id), outcome:'committed',
      affected_entities:clone(tx.affected_set), evidence_refs:tx.transforms.flatMap(t=>t.evidence_refs||[])
    };
    this.events.push(ev);
    return {revision:clone(revision), event:clone(ev), transaction:clone(tx)};
  }

  forkBranch({source_revision_id, id:branchId, name, intent}) {
    if (!this.revisions.has(source_revision_id)) throw new KernelError('REVISION_NOT_FOUND', source_revision_id);
    const b={id:branchId,name,intent,base_revision_id:source_revision_id,head_revision_id:source_revision_id};
    this.branches.set(branchId,b); return clone(b);
  }

  inverseTransform(transform) {
    if (transform.type==='MoveBoundary') return {...clone(transform), id:`${transform.id}-inverse`, inputs:{delta_mm:-transform.inputs.delta_mm}, rationale:`Undo: ${transform.rationale}`};
    throw new KernelError('NOT_REVERSIBLE', transform.type);
  }
}