import { openWorld } from '../src/store.mjs';
import { referenceDomains } from '../src/reference-domains.mjs';
import { panelDomain } from '../src/mock-fea.mjs';
import { createWorldGateway } from '../src/gateway-host.mjs';
import { createAuthorityClient, createCapabilityClient, createInProcessTransport } from '../../kernel-gateway/src/index.mjs';
import { initialState as terrainInitial, authorize as terrainAuthorize } from './fixture.mjs';

export const initialState = { ...terrainInitial, panel: { id: 'P27', thicknessMm: 10, lengthMm: 1000, steelGrade: 'S355' } };
export const domains = { ...referenceDomains, panel: panelDomain,
  geometry: { version: 'synthetic-geometry/1', evaluate(snapshot, payload, capability) {
    if (!capability.panel || !Number.isFinite(payload.lengthMm) || payload.lengthMm <= 0) throw new Error('Invalid geometry');
    return { status: 'pass', state: { ...snapshot.state, panel: { ...snapshot.state.panel, lengthMm: payload.lengthMm } },
      evidence: [{ status: 'pass', evaluator: 'synthetic-geometry/1' }], representations: snapshot.representations };
  } },
};
export const authorize = (actor, request, phase) => {
  if (!['human', 'agent'].includes(actor.id) || (phase === 'commit' && actor.id !== 'human')) return null;
  return { ...terrainAuthorize(actor, request, phase), panel: true };
};
export const open = (filename, extra = {}) => openWorld({ filename, initialState, domains, authorize, ...extra });
export function clients(world, policy = ({ principal, action }) => ({
  allowed: ['human','agent'].includes(principal.id) && (action !== 'proposal.publish' || principal.id === 'human'),
})) {
  const gateway = createWorldGateway({ world, authorize: policy });
  const capabilityTransport = createInProcessTransport(gateway, { principal: { id: 'agent' } });
  return { capabilityTransport,
    capability: createCapabilityClient({ transport: capabilityTransport }),
    governor: createAuthorityClient({ transport: createInProcessTransport(gateway, { principal: { id: 'human' } }) }),
  };
}
