/**
 * services/rating/LeapYearService.ts
 *
 * Service Object for the Rating Engine — Leap Year check endpoint.
 *
 *   GET  /api/v1/ratingengine/occurrences/leapyearcheck
 *        ?effectiveDate=YYYY-MM-DD&expirationDate=YYYY-MM-DD
 *
 * Usage:
 *   const svc    = new LeapYearService(request, process.env.RATING_ENGINE_URL!);
 *   const result = await svc.check('2027-01-01', '2027-12-31');
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';

export interface LeapYearResult {
  spansLeapDay:   boolean;
  yearDenominator: number;
  termDays:        number;
  effectiveDate:   string;
  expirationDate:  string;
  rawBody:         unknown;
}

export class LeapYearService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  async check(effectiveDate: string, expirationDate: string): Promise<LeapYearResult> {
    const res = await this.get<Record<string, unknown>>(
      '/api/v1/ratingengine/occurrences/leapyearcheck',
      { effectiveDate, expirationDate },
    );

    if (res.status !== 200) {
      throw new Error(`[LeapYearService.check] Expected 200, got ${res.status}`);
    }

    const b = res.body;
    return {
      spansLeapDay:    Boolean(b['spans_leap_day']   ?? false),
      yearDenominator: Number(b['year_denominator']  ?? 0),
      termDays:        Number(b['term_days']          ?? 0),
      effectiveDate:   String(b['effective_date']     ?? effectiveDate),
      expirationDate:  String(b['expiration_date']    ?? expirationDate),
      rawBody:         b,
    };
  }
}
