import { createKernelGateway } from '../../kernel-gateway/src/index.mjs';
import { WorldError } from './store.mjs';

const fail = code => { throw new WorldError(code); };

/** Host mapping for the bounded main-branch fixtures. Policy and the world factory
 * remain trusted; capability clients receive only a principal-bound transport. */
export function createWorldGateway({ world, authorize }) {
  const execution = world.execution;
  const number = execution.revisionNumber;
  function resolve(payload) {
    if (payload.transforms.length !== 1) fail('UNSUPPORTED_TRANSFORMS');
    const transform = payload.transforms[0];
    if (transform.schemaVersion !== '1') fail('UNSUPPORTED_TRANSFORM_VERSION');
    const baseRevision = number(payload.baseRevision);
    let domain;
    if (transform.type === 'terrain.controls' && transform.targetRefs.length === 1 && transform.targetRefs[0] === 'terrain') {
      domain = 'terrain';
      if (transform.payload.branchId !== 'main' || transform.payload.baseWorldRevision !== baseRevision) fail('BASE_REVISION_MISMATCH');
    } else if (transform.type === 'panel.set-thickness' && transform.targetRefs.length === 1 && transform.targetRefs[0] === 'panel:P27') {
      domain = 'panel';
    } else fail('UNSUPPORTED_TRANSFORM');
    return { branch: 'main', domain, baseRevision, requestId: payload.proposalId, payload: transform.payload };
  }
  return createKernelGateway({ authorize, ports: {
    readWorld: ({ request }) => {
      const { revision, selector } = request.payload;
      // Returning the complete bounded snapshot is explicit, never a silent fallback.
      if (!selector || Object.keys(selector).length !== 1 || selector.kind !== 'snapshot') fail('UNSUPPORTED_SELECTOR');
      const s = world.snapshot('main', revision === 'head' ? undefined : number(revision));
      return { ...s, revision: `R${s.revision}` };
    },
    submitProposal: ({ principal, request }) => {
      const resolved = resolve(request.payload);
      // Policy is checked at the gateway; domain validation is repeated at publish.
      const p = execution.saveProposal(principal, request.payload, resolved, request.idempotencyKey);
      return { proposalId: p.id, baseRevision: p.payload.baseRevision, status: 'proposed', transformId: p.transformId };
    },
    getProposal: ({ request }) => {
      const p = execution.proposal(request.payload.proposalId);
      const publications = execution.publications(x => x.proposalId === p.id);
      return { ...p, status: publications.length ? 'committed' : 'proposed', publications };
    },
    getHistory: ({ request }) => {
      const p = request.payload;
      if (p.runId) return execution.inspectRun(p.runId);
      if (p.revision) return world.snapshot('main', number(p.revision));
      if (p.proposalId) return { proposal: execution.proposal(p.proposalId), publications: execution.publications(x => x.proposalId === p.proposalId) };
      if (p.transformId) return { publications: execution.publications(x => x.transformId === p.transformId) };
      if (p.eventId?.startsWith('event:')) return world.snapshot('main', number(p.eventId.slice(6))).event;
      fail('HISTORY_NOT_FOUND');
    },
    publishProposal: ({ principal, request }) => {
      const p = execution.proposal(request.payload.proposalId);
      const receipt = world.session(principal, p.id).submit({ ...p.worldRequest, requestId: request.idempotencyKey });
      return { ...receipt, proposalId: p.id, resultingRevision: `R${receipt.worldRevision}`, transformId: p.transformId };
    },
  } });
}

/** A property explanation follows actual value-changing revision events. It never
 * attributes an unchanged property to the latest unrelated edit. */
export function explainPanelThickness(world, revision = world.snapshot().revision) {
  let current = world.snapshot('main', revision);
  const value = current.state.panel?.thicknessMm;
  if (value === undefined) fail('PROPERTY_NOT_FOUND');
  while (current.parent !== null) {
    const parent = world.snapshot('main', current.parent);
    if (parent.state.panel?.thicknessMm !== value) break;
    current = parent;
  }
  const provenance = current.event?.provenance ?? null;
  return { entityRef: 'panel:P27', property: 'thicknessMm', value,
    introducedAt: `R${current.revision}`,
    previousValue: current.parent === null ? null : world.snapshot('main', current.parent).state.panel.thicknessMm,
    provenance, run: provenance?.runRef ? world.execution.inspectRun(provenance.runRef, `R${revision}`) : null };
}
