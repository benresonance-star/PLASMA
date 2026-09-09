export {
  applyChangeSet,
  buildAiChangesView,
  executeReadTool,
  impactPreview,
  pollJob,
  validateChangeSet,
  type AiChangesViewItem,
  type AiJob,
  type AiJobKind,
  type AiJobStatus,
  type AiReadToolRequest,
  type AiReadToolResult,
  type ChangeSet,
  type ChangeSetCommand,
} from './tools.js';
export {
  enqueueJob,
  runCompileValidateCompare,
  runScriptedAgentFixture,
  type AgentFixtureResult,
} from './agent-fixture.js';
export {
  runCompileValidateCompareLive,
  runScriptedAgentWithLiveCompile,
  type LiveCompileFn,
  type LiveCompileOptions,
  type LiveCompileResult,
} from './live-compile.js';
export { loadLlmConfig, type LlmConfig } from './llm-config.js';
export {
  chatWithTools,
  type LlmChatMessage,
  type LlmChatResult,
  type LlmFetch,
  type LlmToolCall,
  type LlmToolDefinition,
} from './llm-client.js';
export {
  AI_TOOL_DEFINITIONS,
  buildAiToolDefinitions,
  routeAiTool,
  type ToolRouterContext,
  type ToolRouterResult,
} from './tool-router.js';
export {
  resolveAgentMode,
  runAgent,
  type AgentBranchBinding,
  type AgentCatalog,
  type AgentRunInput,
  type AgentRunMode,
  type AgentRunResult,
  type ResolvedAgentMode,
} from './agent-runner.js';
export {
  AGENT_CONTEXT_SCHEMA_VERSION,
  AGENT_VIEWPORT_UP_NOTE,
  AGENT_WORLD_LENGTH_UNIT,
  AGENT_WORLD_UP_AXIS,
  DEFAULT_ACCEPT_OPS,
  DEFAULT_UNSUPPORTED_OPS,
  assertAcceptOpsSubset,
  buildAgentContextPackage,
  renderAgentSystemPrompt,
  type AgentContextPackage,
  type AgentContextParameter,
  type BuildAgentContextInput,
} from './agent-context.js';
export { agentParametersFromPattern } from './pattern-parameters.js';
export {
  COMPOSITION_D01_ID,
  DEMO_Y_SEMANTIC_ID,
  D01_FIRST_Y_COMPONENT_ID,
  D01_PATTERN_INSTANCE_ID,
  GOLDBERG_PATTERN_PUBLISHED_ID,
  PARAM_D01_ARM_WIDTH_ID,
  PARAM_D01_LENGTH_ID,
  PARAM_D01_STRUCTURAL_DEPTH_ID,
  mapChangeSetTargetId,
  resolveGeometryParamTarget,
  type D01GeometryParamPath,
  type MappedTargetId,
} from './id-map.js';
export {
  changeSetHasPatternParamRule,
  changeSetToSemanticCommands,
  CREATE_KINDS_ALLOWLIST,
  isOrganiseOnlyLowerResult,
  ARM_WIDTH_MM_MAX,
  ARM_WIDTH_MM_MIN,
  LENGTH_MM_MAX,
  LENGTH_MM_MIN,
  STRUCTURAL_DEPTH_MM_MAX,
  STRUCTURAL_DEPTH_MM_MIN,
  type ChangeSetAcceptEnvelope,
  type ChangeSetAcceptMode,
  type ChangeSetLowerResult,
  type CreatedParameterStub,
  type GeometryParamOverrides,
  type OrganiseAcceptOp,
} from './changeset-accept.js';
export {
  buildOrganiseProposeCommands,
  buildTenMoveOrganiseFixture,
  proposeOrganiseChangeSet,
  type OrganiseProposeMove,
} from './organise-propose.js';
export {
  buildFeedbackPacket,
  createRepairSession,
  recordAiAudit,
  runRepairAttempt,
  whatIfTool,
  whyTool,
  type AiAuditRecord,
  type FeedbackPacket,
  type RepairAttempt,
  type RepairSession,
  type WhatIfResult,
  type WhyResult,
} from './repair.js';
export {
  isReadOnlyFocusCommand,
  parseGraphFocusCommand,
  type GraphFocusCommand,
} from './graph-focus.js';
