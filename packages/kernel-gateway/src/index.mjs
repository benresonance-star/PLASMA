export const KERNEL_GATEWAY_CONTRACT = 'PLS-KERNEL-GATEWAY-01/0.1.0';

export const KERNEL_GATEWAY_METHODS = Object.freeze({
  READ_WORLD: 'world.read',
  SUBMIT_PROPOSAL: 'proposal.submit',
  GET_PROPOSAL: 'proposal.get',
  GET_HISTORY: 'history.get',
  PUBLISH_PROPOSAL: 'proposal.publish',
});

const METHOD_SET = new Set(Object.values(KERNEL_GATEWAY_METHODS));
const RESERVED_TOP_LEVEL_IDENTITY_KEYS = new Set(['actor', 'actorId', 'principal', 'authority']);

export class KernelGatewayError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'KernelGatewayError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new KernelGatewayError(code, message, details);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_REQUEST', `${label} must be a non-empty string`);
  }
}

function assertPlainJson(value, path = '$') {
  if (value === null) return;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (type === 'number' && !Number.isFinite(value)) {
      fail('INVALID_REQUEST', `${path} must not contain non-finite numbers`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPlainJson(item, `${path}[${index}]`));
    return;
  }
  if (type !== 'object') {
    fail('INVALID_REQUEST', `${path} must contain JSON-compatible plain data only`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    fail('INVALID_REQUEST', `${path} must contain plain objects only`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      fail('INVALID_REQUEST', `${path}.${key} is not permitted`);
    }
    assertPlainJson(item, `${path}.${key}`);
  }
}

function assertOnlyKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail('INVALID_REQUEST', `${label} contains unsupported field ${key}`);
  }
}

function validateTransform(transform, index) {
  assertPlainJson(transform, `payload.transforms[${index}]`);
  if (!transform || Array.isArray(transform)) {
    fail('INVALID_REQUEST', `payload.transforms[${index}] must be an object`);
  }
  assertOnlyKeys(
    transform,
    new Set(['type', 'schemaVersion', 'targetRefs', 'payload']),
    `payload.transforms[${index}]`,
  );
  assertNonEmptyString(transform.type, `payload.transforms[${index}].type`);
  if (transform.schemaVersion !== undefined) {
    assertNonEmptyString(transform.schemaVersion, `payload.transforms[${index}].schemaVersion`);
  }
  if (!Array.isArray(transform.targetRefs)) {
    fail('INVALID_REQUEST', `payload.transforms[${index}].targetRefs must be an array`);
  }
  transform.targetRefs.forEach((ref, refIndex) =>
    assertNonEmptyString(ref, `payload.transforms[${index}].targetRefs[${refIndex}]`),
  );
  if (!transform.payload || Array.isArray(transform.payload) || typeof transform.payload !== 'object') {
    fail('INVALID_REQUEST', `payload.transforms[${index}].payload must be an object`);
  }
}

function validateMethodPayload(method, payload, idempotencyKey) {
  switch (method) {
    case KERNEL_GATEWAY_METHODS.READ_WORLD: {
      assertOnlyKeys(payload, new Set(['revision', 'selector']), 'payload');
      assertNonEmptyString(payload.revision, 'payload.revision');
      if (payload.selector === undefined) fail('INVALID_REQUEST', 'payload.selector is required');
      return;
    }
    case KERNEL_GATEWAY_METHODS.SUBMIT_PROPOSAL: {
      assertOnlyKeys(
        payload,
        new Set(['proposalId', 'baseRevision', 'transforms', 'evidenceRefs', 'runRef', 'intentRefs']),
        'payload',
      );
      assertNonEmptyString(payload.proposalId, 'payload.proposalId');
      assertNonEmptyString(payload.baseRevision, 'payload.baseRevision');
      if (payload.baseRevision === 'head') {
        fail('INVALID_REQUEST', 'payload.baseRevision must be an exact immutable revision, not head');
      }
      if (!Array.isArray(payload.transforms) || payload.transforms.length === 0) {
        fail('INVALID_REQUEST', 'payload.transforms must contain at least one typed transform');
      }
      payload.transforms.forEach(validateTransform);
      for (const field of ['evidenceRefs', 'intentRefs']) {
        if (payload[field] !== undefined) {
          if (!Array.isArray(payload[field])) fail('INVALID_REQUEST', `payload.${field} must be an array`);
          payload[field].forEach((ref, index) => assertNonEmptyString(ref, `payload.${field}[${index}]`));
        }
      }
      if (payload.runRef !== undefined) assertNonEmptyString(payload.runRef, 'payload.runRef');
      assertNonEmptyString(idempotencyKey, 'idempotencyKey');
      return;
    }
    case KERNEL_GATEWAY_METHODS.GET_PROPOSAL: {
      assertOnlyKeys(payload, new Set(['proposalId']), 'payload');
      assertNonEmptyString(payload.proposalId, 'payload.proposalId');
      return;
    }
    case KERNEL_GATEWAY_METHODS.GET_HISTORY: {
      assertOnlyKeys(
        payload,
        new Set(['revision', 'eventId', 'transformId', 'proposalId', 'runId']),
        'payload',
      );
      const refs = Object.values(payload).filter((value) => typeof value === 'string' && value.length > 0);
      if (refs.length !== 1) {
        fail('INVALID_REQUEST', 'history.get requires exactly one history reference');
      }
      return;
    }
    case KERNEL_GATEWAY_METHODS.PUBLISH_PROPOSAL: {
      assertOnlyKeys(payload, new Set(['proposalId']), 'payload');
      assertNonEmptyString(payload.proposalId, 'payload.proposalId');
      assertNonEmptyString(idempotencyKey, 'idempotencyKey');
      return;
    }
    default:
      fail('UNKNOWN_METHOD', `Unsupported gateway method ${String(method)}`);
  }
}

export function validateKernelGatewayRequest(request) {
  assertPlainJson(request);
  if (!request || Array.isArray(request)) fail('INVALID_REQUEST', 'request must be an object');
  for (const key of Object.keys(request)) {
    if (RESERVED_TOP_LEVEL_IDENTITY_KEYS.has(key)) {
      fail('SELF_DECLARED_IDENTITY', `${key} must come from trusted transport context, not request data`);
    }
  }
  assertOnlyKeys(
    request,
    new Set(['contractVersion', 'requestId', 'method', 'payload', 'idempotencyKey']),
    'request',
  );
  if (request.contractVersion !== KERNEL_GATEWAY_CONTRACT) {
    fail('CONTRACT_MISMATCH', `Expected ${KERNEL_GATEWAY_CONTRACT}`);
  }
  assertNonEmptyString(request.requestId, 'requestId');
  if (!METHOD_SET.has(request.method)) fail('UNKNOWN_METHOD', `Unsupported gateway method ${String(request.method)}`);
  if (!request.payload || Array.isArray(request.payload) || typeof request.payload !== 'object') {
    fail('INVALID_REQUEST', 'payload must be an object');
  }
  if (request.idempotencyKey !== undefined) assertNonEmptyString(request.idempotencyKey, 'idempotencyKey');
  validateMethodPayload(request.method, request.payload, request.idempotencyKey);
  return structuredClone(request);
}

function assertPrincipal(context) {
  const principal = context?.principal;
  if (!principal || typeof principal !== 'object') fail('UNAUTHENTICATED', 'Trusted principal is required');
  assertNonEmptyString(principal.id, 'principal.id');
  return structuredClone(principal);
}

const PORT_BY_METHOD = Object.freeze({
  [KERNEL_GATEWAY_METHODS.READ_WORLD]: 'readWorld',
  [KERNEL_GATEWAY_METHODS.SUBMIT_PROPOSAL]: 'submitProposal',
  [KERNEL_GATEWAY_METHODS.GET_PROPOSAL]: 'getProposal',
  [KERNEL_GATEWAY_METHODS.GET_HISTORY]: 'getHistory',
  [KERNEL_GATEWAY_METHODS.PUBLISH_PROPOSAL]: 'publishProposal',
});

export function createKernelGateway({ authorize, ports }) {
  if (typeof authorize !== 'function') throw new TypeError('authorize must be a function');
  if (!ports || typeof ports !== 'object') throw new TypeError('ports must be an object');
  for (const portName of Object.values(PORT_BY_METHOD)) {
    if (typeof ports[portName] !== 'function') throw new TypeError(`ports.${portName} must be a function`);
  }

  return Object.freeze({
    async handle(rawRequest, context) {
      const request = validateKernelGatewayRequest(rawRequest);
      const principal = assertPrincipal(context);
      const decision = await authorize({
        principal: structuredClone(principal),
        action: request.method,
        request: structuredClone(request),
      });
      if (!decision || decision.allowed !== true) {
        fail('FORBIDDEN', `Principal ${principal.id} is not authorized for ${request.method}`, {
          reason: decision?.reason ?? 'not_authorized',
        });
      }

      const portName = PORT_BY_METHOD[request.method];
      const result = await ports[portName]({
        principal: structuredClone(principal),
        request: structuredClone(request),
        authority: structuredClone(decision),
      });
      assertPlainJson(result, '$result');
      return structuredClone(result);
    },
  });
}

function createRequestBuilder(transport, nextRequestId) {
  if (!transport || typeof transport.request !== 'function') throw new TypeError('transport.request must be a function');
  if (typeof nextRequestId !== 'function') throw new TypeError('nextRequestId must be a function');
  return async (method, payload, idempotencyKey) =>
    transport.request({
      contractVersion: KERNEL_GATEWAY_CONTRACT,
      requestId: nextRequestId(),
      method,
      payload,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });
}

export function createCapabilityClient({ transport, nextRequestId = () => crypto.randomUUID() }) {
  const call = createRequestBuilder(transport, nextRequestId);
  return Object.freeze({
    readWorld: (payload) => call(KERNEL_GATEWAY_METHODS.READ_WORLD, payload),
    submitProposal: (payload, idempotencyKey) =>
      call(KERNEL_GATEWAY_METHODS.SUBMIT_PROPOSAL, payload, idempotencyKey),
    getProposal: (payload) => call(KERNEL_GATEWAY_METHODS.GET_PROPOSAL, payload),
    getHistory: (payload) => call(KERNEL_GATEWAY_METHODS.GET_HISTORY, payload),
  });
}

export function createAuthorityClient(options) {
  const capability = createCapabilityClient(options);
  const call = createRequestBuilder(options.transport, options.nextRequestId ?? (() => crypto.randomUUID()));
  return Object.freeze({
    ...capability,
    publishProposal: (payload, idempotencyKey) =>
      call(KERNEL_GATEWAY_METHODS.PUBLISH_PROPOSAL, payload, idempotencyKey),
  });
}

export function createInProcessTransport(gateway, context) {
  if (!gateway || typeof gateway.handle !== 'function') throw new TypeError('gateway.handle must be a function');
  return Object.freeze({
    request: (request) => gateway.handle(request, context),
  });
}
