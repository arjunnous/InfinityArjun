/**
 * services/rules/FieldModelService.ts
 *
 * Service Object — Rules Engine: Data Model endpoints (suite18181).
 *
 *   POST  /api/v1/rules/data-model/fields
 *   GET   /api/v1/rules/data-model/fields
 *   GET   /api/v1/rules/data-model/fields/{id}
 *   PUT   /api/v1/rules/data-model/fields/{id}/validation
 *   POST  /api/v1/rules/data-model/entities
 *   GET   /api/v1/rules/data-model/entities
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';
import * as crypto                from 'crypto';

export interface CreateFieldRequest {
  fieldCode?:  string;
  fieldName?:  string;
  dataType?:   string;    // 'String' | 'Integer' | 'Decimal' | 'Boolean' | 'Date'
  description?: string;
  required?:   boolean;
  tenantId?:   string;
}

export interface UpdateValidationRequest {
  minValue?:   number;
  maxValue?:   number;
  pattern?:    string;
  required?:   boolean;
  enumValues?: string[];
}

export interface CreateEntityRequest {
  entityCode?: string;
  entityName?: string;
  description?: string;
  fields?:     string[];    // field IDs to include
  tenantId?:   string;
}

export interface FieldRecord {
  id:         string;
  fieldCode:  string;
  fieldName:  string;
  dataType:   string;
  required:   boolean;
  tenantId:   string;
  rawBody:    unknown;
}

export interface EntityRecord {
  id:         string;
  entityCode: string;
  entityName: string;
  rawBody:    unknown;
}

const BASE   = '/api/v1/rules/data-model';
const TENANT = process.env['TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export class FieldModelService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Create a new data-model field definition. */
  async createField(opts?: CreateFieldRequest): Promise<FieldRecord> {
    const code = opts?.fieldCode ?? `qa_field_${crypto.randomBytes(3).toString('hex')}`;
    const res  = await this.post<Record<string, unknown>>(`${BASE}/fields`, {
      field_code:  code,
      field_name:  opts?.fieldName   ?? code,
      data_type:   opts?.dataType    ?? 'String',
      description: opts?.description ?? `Automated test field — ${code}`,
      required:    opts?.required    ?? false,
      tenant_id:   opts?.tenantId    ?? TENANT,
    });

    if (![200, 201].includes(res.status)) {
      throw new Error(`[FieldModelService.createField] Expected 201, got ${res.status}`);
    }
    return this.parseField(res.body);
  }

  /** List all field definitions. */
  async listFields(): Promise<FieldRecord[]> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/fields`);
    if (res.status !== 200) {
      throw new Error(`[FieldModelService.listFields] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map(i => this.parseField(i));
  }

  /** Get a field definition by ID. */
  async getField(id: string): Promise<FieldRecord> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/fields/${id}`);
    if (res.status !== 200) {
      throw new Error(`[FieldModelService.getField] Expected 200, got ${res.status}`);
    }
    return this.parseField(res.body);
  }

  /** Update validation rules on a field. */
  async updateValidation(id: string, opts: UpdateValidationRequest): Promise<FieldRecord> {
    const payload: Record<string, unknown> = {};
    if (opts.minValue   !== undefined) payload['min_value']   = opts.minValue;
    if (opts.maxValue   !== undefined) payload['max_value']   = opts.maxValue;
    if (opts.pattern    !== undefined) payload['pattern']     = opts.pattern;
    if (opts.required   !== undefined) payload['required']    = opts.required;
    if (opts.enumValues !== undefined) payload['enum_values'] = opts.enumValues;

    const res = await this.patch<Record<string, unknown>>(
      `${BASE}/fields/${id}/validation`,
      payload,
    );
    if (![200, 204].includes(res.status)) {
      throw new Error(`[FieldModelService.updateValidation] Expected 200/204, got ${res.status}`);
    }
    return this.parseField(res.body);
  }

  /** Create a custom entity (group of fields). */
  async createEntity(opts?: CreateEntityRequest): Promise<EntityRecord> {
    const code = opts?.entityCode ?? `qa_entity_${crypto.randomBytes(3).toString('hex')}`;
    const res  = await this.post<Record<string, unknown>>(`${BASE}/entities`, {
      entity_code:  code,
      entity_name:  opts?.entityName  ?? code,
      description:  opts?.description ?? `Automated test entity — ${code}`,
      field_ids:    opts?.fields      ?? [],
      tenant_id:    opts?.tenantId    ?? TENANT,
    });

    if (![200, 201].includes(res.status)) {
      throw new Error(`[FieldModelService.createEntity] Expected 201, got ${res.status}`);
    }
    const d = (res.body['data'] as Record<string, unknown>) ?? res.body;
    return {
      id:         String(d['id']           ?? ''),
      entityCode: String(d['entity_code']  ?? code),
      entityName: String(d['entity_name']  ?? code),
      rawBody:    res.body,
    };
  }

  /** List all custom entities. */
  async listEntities(): Promise<EntityRecord[]> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/entities`);
    if (res.status !== 200) {
      throw new Error(`[FieldModelService.listEntities] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map((i) => ({
      id:         String(i['id']           ?? ''),
      entityCode: String(i['entity_code']  ?? ''),
      entityName: String(i['entity_name']  ?? ''),
      rawBody:    i,
    }));
  }

  private parseField(body: Record<string, unknown>): FieldRecord {
    const d    = (body['data']       as Record<string, unknown>) ?? body;
    const attr = (d['attributes']    as Record<string, unknown>) ?? d;
    return {
      id:        String(d['id']             ?? ''),
      fieldCode: String(attr['field_code']  ?? ''),
      fieldName: String(attr['field_name']  ?? ''),
      dataType:  String(attr['data_type']   ?? ''),
      required:  Boolean(attr['required']   ?? false),
      tenantId:  String(attr['tenant_id']   ?? ''),
      rawBody:   body,
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
