/**
 * services/rules/RuleService.ts
 *
 * Service Object — Rules Engine: Rule CRUD + lifecycle endpoints.
 * Used by suite18178, suite18180, suite18186, suite19725.
 *
 *   POST   /api/v1/rules                        → 201  Create
 *   GET    /api/v1/rules                        → 200  List
 *   GET    /api/v1/rules/{id}                   → 200  Get by ID
 *   PUT    /api/v1/rules/{id}                   → 200  Update
 *   DELETE /api/v1/rules/{id}                   → 204  Delete
 *   POST   /api/v1/rules/{id}/submit
 *   POST   /api/v1/rules/{id}/approve
 *   POST   /api/v1/rules/{id}/reject
 *   POST   /api/v1/rules/{id}/deploy
 *   POST   /api/v1/rules/{id}/rollback
 *   GET    /api/v1/rules/{id}/deployments
 *   GET    /api/v1/rules/{id}/audit
 *   GET    /api/v1/rules/{id}/versions
 *   POST   /api/v1/rules/{id}/versions/compare
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';
import * as crypto                from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateRuleRequest {
  ruleCode?:       string;          // auto-generated if omitted
  ruleName?:       string;
  description?:    string;
  executionPhase?: string;          // e.g. 'BusinessValidation'
  context?:        string;          // e.g. 'Quote'
  tenantId?:       string;
  body?:           unknown;         // AST or expression body
}

export interface UpdateRuleRequest {
  ruleName?:    string;
  description?: string;
  body?:        unknown;
}

export interface RuleActionRequest {
  actionBy?:  string;
  tenantId?:  string;
  comment?:   string;
  reason?:    string;
}

export interface DeployRequest {
  environment?: string;
  tenantId?:    string;
}

export interface CompareRequest {
  versionA: string;
  versionB: string;
}

export interface RuleResponse {
  id:              string;
  ruleCode:        string;
  ruleName:        string;
  status:          string;
  versionNumber:   number;
  executionPhase:  string;
  context:         string;
  createdAt:       string;
  rawBody:         unknown;
}

export interface DeploymentRecord {
  id:          string;
  environment: string;
  deployedAt:  string;
  deployedBy:  string;
  status:      string;
  rawBody:     unknown;
}

export interface AuditEntry {
  id:         string;
  action:     string;
  performedBy: string;
  performedAt: string;
  rawBody:    unknown;
}

export interface VersionRecord {
  versionNumber: number;
  status:        string;
  createdAt:     string;
  rawBody:       unknown;
}

export interface CompareResult {
  differences:   unknown[];
  diffCount:     number;
  rawBody:       unknown;
}

export interface ListParams {
  status?:   string;
  context?:  string;
  pageSize?: number;
  page?:     number;
}

const BASE     = '/api/v1/rules';
const TENANT   = process.env['TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ACTOR    = 'qa-tester';
const APPROVER = 'qa-approver';

// ─── Service ──────────────────────────────────────────────────────────────────

export class RuleService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Create a new rule. Returns the created rule with its id. */
  async create(opts?: CreateRuleRequest): Promise<RuleResponse> {
    const ruleCode = opts?.ruleCode ?? `QA-RULE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const res = await this.post<Record<string, unknown>>(BASE, {
      rule_code:       ruleCode,
      rule_name:       opts?.ruleName       ?? ruleCode,
      description:     opts?.description    ?? `Automated test rule — ${ruleCode}`,
      execution_phase: opts?.executionPhase ?? 'BusinessValidation',
      context:         opts?.context        ?? 'Quote',
      tenant_id:       opts?.tenantId       ?? TENANT,
      body:            opts?.body           ?? this.defaultAst(),
    });

    if (res.status !== 201) {
      throw new Error(`[RuleService.create] Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return this.parseRule(res.body);
  }

  /** List rules with optional filters. */
  async list(params?: ListParams): Promise<RuleResponse[]> {
    const q: Record<string, string> = {};
    if (params?.status)   q['status']      = params.status;
    if (params?.context)  q['context']     = params.context;
    if (params?.pageSize) q['page[size]']  = String(params.pageSize);
    if (params?.page)     q['page[number]']= String(params.page);

    const res = await this.get<Record<string, unknown>>(BASE, q);
    if (res.status !== 200) {
      throw new Error(`[RuleService.list] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map(i => this.parseRule(i));
  }

  /** Get a rule by ID. */
  async getById(id: string): Promise<RuleResponse> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/${id}`);
    if (res.status !== 200) {
      throw new Error(`[RuleService.getById] Expected 200, got ${res.status}`);
    }
    return this.parseRule(res.body);
  }

  /** Update a rule body / name. */
  async update(id: string, opts: UpdateRuleRequest): Promise<RuleResponse> {
    const payload: Record<string, unknown> = {};
    if (opts.ruleName)   payload['rule_name']   = opts.ruleName;
    if (opts.description) payload['description'] = opts.description;
    if (opts.body)        payload['body']         = opts.body;

    const res = await this.patch<Record<string, unknown>>(`${BASE}/${id}`, payload);
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RuleService.update] Expected 200/204, got ${res.status}`);
    }
    return this.parseRule(res.body);
  }

  /** Delete a rule. */
  async delete(id: string): Promise<void> {
    const res = await super.delete(`${BASE}/${id}`);
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RuleService.delete] Expected 204, got ${res.status}`);
    }
  }

  /** Submit the rule for review. */
  async submit(id: string, opts?: RuleActionRequest): Promise<void> {
    const res = await this.post(`${BASE}/${id}/submit`, this.actionBody(opts));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RuleService.submit] Expected 200/204, got ${res.status}`);
    }
  }

  /** Approve the rule (four-eyes — different actor from creator). */
  async approve(id: string, opts?: RuleActionRequest): Promise<void> {
    const res = await this.post(`${BASE}/${id}/approve`,
      this.actionBody({ actionBy: APPROVER, ...opts }));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RuleService.approve] Expected 200/204, got ${res.status}`);
    }
  }

  /** Reject the rule with a reason. */
  async reject(id: string, reason: string, opts?: RuleActionRequest): Promise<void> {
    const res = await this.post(`${BASE}/${id}/reject`, {
      ...this.actionBody(opts),
      reason,
    });
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RuleService.reject] Expected 200/204, got ${res.status}`);
    }
  }

  /** Deploy the rule to an environment. */
  async deploy(id: string, opts?: DeployRequest): Promise<DeploymentRecord> {
    const res = await this.post<Record<string, unknown>>(`${BASE}/${id}/deploy`, {
      environment: opts?.environment ?? 'QA',
      tenant_id:   opts?.tenantId    ?? TENANT,
    });
    if (![200, 201].includes(res.status)) {
      throw new Error(`[RuleService.deploy] Expected 200/201, got ${res.status}`);
    }
    return this.parseDeployment(res.body);
  }

  /** Roll back the rule to its previous approved version. */
  async rollback(id: string, opts?: RuleActionRequest): Promise<void> {
    const res = await this.post(`${BASE}/${id}/rollback`, this.actionBody(opts));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RuleService.rollback] Expected 200/204, got ${res.status}`);
    }
  }

  /** Get deployment history for a rule. */
  async getDeployments(id: string): Promise<DeploymentRecord[]> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/${id}/deployments`);
    if (res.status !== 200) {
      throw new Error(`[RuleService.getDeployments] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map(i => this.parseDeployment(i));
  }

  /** Get audit trail for a rule. */
  async getAudit(id: string): Promise<AuditEntry[]> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/${id}/audit`);
    if (res.status !== 200) {
      throw new Error(`[RuleService.getAudit] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map(i => ({
      id:          String(i['id']           ?? ''),
      action:      String(i['action']        ?? ''),
      performedBy: String(i['performed_by']  ?? ''),
      performedAt: String(i['performed_at']  ?? ''),
      rawBody:     i,
    }));
  }

  /** Get version history for a rule. */
  async getVersions(id: string): Promise<VersionRecord[]> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/${id}/versions`);
    if (res.status !== 200) {
      throw new Error(`[RuleService.getVersions] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map(i => ({
      versionNumber: Number(i['version_number'] ?? 0),
      status:        String(i['status']          ?? ''),
      createdAt:     String(i['created_at']      ?? ''),
      rawBody:       i,
    }));
  }

  /** Compare two versions of a rule. */
  async compareVersions(id: string, opts: CompareRequest): Promise<CompareResult> {
    const res = await this.post<Record<string, unknown>>(
      `${BASE}/${id}/versions/compare`,
      { version_a: opts.versionA, version_b: opts.versionB },
    );
    if (res.status !== 200) {
      throw new Error(`[RuleService.compareVersions] Expected 200, got ${res.status}`);
    }
    const body  = res.body;
    const diffs = (body['differences'] as unknown[]) ?? [];
    return { differences: diffs, diffCount: diffs.length, rawBody: body };
  }

  /**
   * Convenience: run the full Create → Submit → Approve lifecycle.
   * Returns the rule ID of the now-Active rule.
   */
  async runLifecycle(opts?: CreateRuleRequest): Promise<string> {
    const rule = await this.create(opts);
    await this.submit(rule.id);
    await this.approve(rule.id);
    console.log(`  [RuleService] Rule ACTIVE: id=${rule.id} code=${rule.ruleCode}`);
    return rule.id;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private actionBody(opts?: RuleActionRequest): Record<string, unknown> {
    return {
      action_by: opts?.actionBy ?? ACTOR,
      tenant_id: opts?.tenantId ?? TENANT,
      ...(opts?.comment ? { comment: opts.comment } : {}),
      ...(opts?.reason  ? { reason:  opts.reason  } : {}),
    };
  }

  private defaultAst(): unknown {
    return {
      type:     'BinaryExpression',
      operator: '>=',
      left:     { type: 'Identifier', name: 'credit_score' },
      right:    { type: 'Literal',    value: 600 },
    };
  }

  private parseRule(body: Record<string, unknown>): RuleResponse {
    const d    = (body['data']       as Record<string, unknown>) ?? body;
    const attr = (d['attributes']    as Record<string, unknown>) ?? d;

    const str = (k: string) => String(attr[k] ?? d[k] ?? body[k] ?? '');
    const num = (k: string) => Number(attr[k] ?? d[k] ?? body[k] ?? 0);

    return {
      id:             String(d['id']   ?? body['id']   ?? ''),
      ruleCode:       str('rule_code'),
      ruleName:       str('rule_name'),
      status:         str('status'),
      versionNumber:  num('version_number'),
      executionPhase: str('execution_phase'),
      context:        str('context'),
      createdAt:      str('created_at'),
      rawBody:        body,
    };
  }

  private parseDeployment(body: Record<string, unknown>): DeploymentRecord {
    const d    = (body['data']       as Record<string, unknown>) ?? body;
    const attr = (d['attributes']    as Record<string, unknown>) ?? d;
    return {
      id:          String(d['id']          ?? ''),
      environment: String(attr['environment'] ?? ''),
      deployedAt:  String(attr['deployed_at'] ?? ''),
      deployedBy:  String(attr['deployed_by'] ?? ''),
      status:      String(attr['status']       ?? ''),
      rawBody:     body,
    };
  }

  private flatList(body: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(body))            return body as Record<string, unknown>[];
    if (Array.isArray(body['data']))    return body['data']    as Record<string, unknown>[];
    if (Array.isArray(body['items']))   return body['items']   as Record<string, unknown>[];
    if (Array.isArray(body['results'])) return body['results'] as Record<string, unknown>[];
    return [];
  }
}
