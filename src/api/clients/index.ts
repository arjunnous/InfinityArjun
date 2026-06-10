/**
 * services/index.ts — barrel export for all Service Objects
 *
 * Import pattern in tests:
 *   import { RatePlanService, OccurrenceService } from '@services/index';
 *   import { RuleService }                        from '@services/index';
 */

// ── Common ────────────────────────────────────────────────────────────────────
export { BaseApiService }      from './common/BaseApiService';
export type { ApiResponse }    from './common/BaseApiService';

// ── Rating Engine ─────────────────────────────────────────────────────────────
export { RatePlanService }     from './rating/RatePlanService';
export type {
  CreateRatePlanRequest,
  RatePlanResponse,
  RatePlanActionRequest,
  LifecycleOptions,
}                              from './rating/RatePlanService';

export { OccurrenceService }   from './rating/OccurrenceService';
export type {
  CalculateRequest,
  OccurrenceResult,
}                              from './rating/OccurrenceService';

export { LeapYearService }     from './rating/LeapYearService';
export type { LeapYearResult } from './rating/LeapYearService';

export { FormulaService }      from './rating/FormulaService';
export type {
  FormulaExtractParams,
  FormulaExtractResult,
  FormulaRecord,
  ExportRecord,
}                              from './rating/FormulaService';

export { PolicyDataService }   from './rating/PolicyDataService';
export type {
  SnapshotResult,
  AccessLogEntry,
  SearchParams,
}                              from './rating/PolicyDataService';

// ── Rules Engine ──────────────────────────────────────────────────────────────
export { RulesEngineService }  from './rules/RulesEngineService';
export type {
  RuleExecutionRequest,
  RuleExecutionResult,
}                              from './rules/RulesEngineService';

export { RuleService }         from './rules/RuleService';
export type {
  CreateRuleRequest,
  UpdateRuleRequest,
  RuleActionRequest,
  DeployRequest,
  CompareRequest,
  RuleResponse,
  DeploymentRecord,
  AuditEntry,
  VersionRecord,
  CompareResult,
  ListParams,
}                              from './rules/RuleService';

export { FieldModelService }   from './rules/FieldModelService';
export type {
  CreateFieldRequest,
  UpdateValidationRequest,
  CreateEntityRequest,
  FieldRecord,
  EntityRecord,
}                              from './rules/FieldModelService';

export { PricingService }      from './rules/PricingService';
export type {
  CalculatePricingRequest,
  LineItem,
  PricingResult,
  TraceResult,
}                              from './rules/PricingService';
