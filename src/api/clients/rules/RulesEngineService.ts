/**
 * services/rules/RulesEngineService.ts
 *
 * Service Object for the Rules Engine microservice.
 *
 *   POST   /api/v1/rulesengine/execute
 *   GET    /api/v1/rulesengine/executions/{executionId}
 *   GET    /api/v1/rulesengine/executions/bypolicy/{policyId}
 *   GET    /api/v1/rulesengine/executions/bytransaction/{transactionId}
 *   GET    /api/v1/rulesengine/audit/{executionId}
 *
 * Usage:
 *   const rules = new RulesEngineService(request, process.env.RULES_URL!);
 *   const result = await rules.execute({ tenantId, policyId, executionPhase, ... });
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';

// ─── Request / Response types ─────────────────────────────────────────────────

export interface RuleExecutionRequest {
  tenantId?:          string;
  policyId?:          string;
  transactionId?:     string;
  transactionType?:   string;           // default: 'NewBusiness'
  executionPhase:     string;           // e.g. 'BusinessValidation', 'OccurrenceRating'
  jurisdictionCode:   string;
  productId?:         string;
  effectiveDate?:     string;
  isDryRun?:          boolean;
  haltOnFirstBlock?:  boolean;
  inputData?:         Record<string, unknown>;
}

export interface RuleResult {
  ruleId:   string;
  ruleName: string;
  outcome:  string;          // 'Allow' | 'Warn' | 'Refer' | 'Block' | 'Decline'
  message:  string;
}

export interface RuleExecutionResult {
  executionId:          string;
  aggregatedOutcome:    string;          // worst-severity outcome across all rules
  totalRulesEvaluated:  number;
  totalRulesFired:      number;
  totalLatencyMs:       number;
  haltedOnBlock:        boolean;
  isDryRun:             boolean;
  executedAt:           string;
  rules:                RuleResult[];
  rawBody:              unknown;
}

const BASE_PATH = '/api/v1/rulesengine';
const TENANT_ID = process.env['TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ─── Service ──────────────────────────────────────────────────────────────────

export class RulesEngineService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Execute rules for a given phase and input data. Returns aggregated outcome. */
  async execute(opts: RuleExecutionRequest): Promise<RuleExecutionResult> {
    const res = await this.post<Record<string, unknown>>(
      `${BASE_PATH}/execute`,
      {
        tenant_id:          opts.tenantId        ?? TENANT_ID,
        policy_id:          opts.policyId        ?? uuid(),
        transaction_id:     opts.transactionId   ?? uuid(),
        transaction_type:   opts.transactionType ?? 'NewBusiness',
        execution_phase:    opts.executionPhase,
        jurisdiction_code:  opts.jurisdictionCode,
        product_id:         opts.productId       ?? uuid(),
        effective_date:     opts.effectiveDate   ?? today(),
        is_dry_run:         opts.isDryRun        ?? false,
        halt_on_first_block: opts.haltOnFirstBlock ?? false,
        input_data:         opts.inputData       ?? {},
      },
    );

    if (res.status !== 200) {
      throw new Error(
        `[RulesEngineService.execute] Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }
    return this.parseResult(res.body);
  }

  /** Get a single execution result by executionId. */
  async getById(executionId: string): Promise<RuleExecutionResult> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE_PATH}/executions/${executionId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[RulesEngineService.getById] Expected 200, got ${res.status}`);
    }
    return this.parseResult(res.body);
  }

  /** Get execution history for a policy. */
  async getByPolicy(policyId: string): Promise<RuleExecutionResult[]> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE_PATH}/executions/bypolicy/${policyId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[RulesEngineService.getByPolicy] Expected 200, got ${res.status}`);
    }
    const items = (res.body['data'] as unknown[]) ?? [res.body];
    return items.map(i => this.parseResult(i as Record<string, unknown>));
  }

  /** Get execution history for a transaction. */
  async getByTransaction(transactionId: string): Promise<RuleExecutionResult[]> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE_PATH}/executions/bytransaction/${transactionId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[RulesEngineService.getByTransaction] Expected 200, got ${res.status}`);
    }
    const items = (res.body['data'] as unknown[]) ?? [res.body];
    return items.map(i => this.parseResult(i as Record<string, unknown>));
  }

  /** Get the audit trail for an execution. */
  async getAudit(executionId: string): Promise<Record<string, unknown>> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE_PATH}/audit/${executionId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[RulesEngineService.getAudit] Expected 200, got ${res.status}`);
    }
    return res.body;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private parseResult(body: Record<string, unknown>): RuleExecutionResult {
    const str  = (k: string): string  => String(body[k]  ?? '');
    const num  = (k: string): number  => Number(body[k]  ?? 0);
    const bool = (k: string): boolean => Boolean(body[k] ?? false);

    const rawRules = (body['rules'] as Array<Record<string, unknown>>) ?? [];
    const rules: RuleResult[] = rawRules.map(r => ({
      ruleId:   String(r['rule_id']   ?? r['id']   ?? ''),
      ruleName: String(r['rule_name'] ?? r['name'] ?? ''),
      outcome:  String(r['outcome']   ?? ''),
      message:  String(r['message']   ?? ''),
    }));

    return {
      executionId:         str('execution_id'),
      aggregatedOutcome:   str('aggregated_outcome'),
      totalRulesEvaluated: num('total_rules_evaluated'),
      totalRulesFired:     num('total_rules_fired'),
      totalLatencyMs:      num('total_latency_ms'),
      haltedOnBlock:       bool('halted_on_block'),
      isDryRun:            bool('is_dry_run'),
      executedAt:          str('executed_at'),
      rules,
      rawBody:             body,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  const h4 = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const h8 = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const y  = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  return `${h8()}-${h4()}-4${h4().slice(1)}-${y}${h4().slice(1)}-${h8()}${h4()}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
