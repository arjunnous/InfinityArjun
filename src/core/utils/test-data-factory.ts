// File: utils/test-data-factory.ts

import { faker } from '@faker-js/faker';
import { resolveSecret } from '@utils/crypto-utils';
import { config } from '@config/project.config';
import { requireEnv } from '@core/config/env';

// ---------------------------------------------------------------------------
// Domain interfaces
// ---------------------------------------------------------------------------

export interface RuleData {
  ruleId: string;
  ruleName: string;
  ruleType: 'UNDERWRITING' | 'RATING' | 'VALIDATION' | 'ELIGIBILITY';
  priority: number;
  condition: string;
  action: string;
  effectiveDate: string;
  expirationDate: string;
  isEnabled: boolean;
  productCode: string;
  description: string;
}

export interface UserCredentials {
  username: string;
  password: string;
  role: 'admin' | 'underwriter' | 'agent';
  displayName: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function futureIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function randomRuleId(): string {
  return `RULE-${faker.string.alphanumeric(8).toUpperCase()}`;
}

function randomProductCode(): string {
  const prefix = faker.helpers.arrayElement(['HO', 'AUTO', 'COM', 'SPEC', 'LIFE']);
  const suffix = String(faker.number.int({ min: 100, max: 999 }));
  return `${prefix}-${suffix}`;
}

// ---------------------------------------------------------------------------
// TestDataFactory
// ---------------------------------------------------------------------------

export class TestDataFactory {
  // -------------------------------------------------------------------------
  // buildRule
  // -------------------------------------------------------------------------

  /**
   * Build a fully populated `RuleData` object.
   *
   * @example
   *   const rule = TestDataFactory.buildRule({ ruleType: 'RATING', isEnabled: false });
   */
  static buildRule(overrides: Partial<RuleData> = {}): RuleData {
    const today = isoDate(new Date());
    const ruleType = faker.helpers.arrayElement([
      'UNDERWRITING',
      'RATING',
      'VALIDATION',
      'ELIGIBILITY',
    ] as RuleData['ruleType'][]);

    const conditionTemplates: Record<RuleData['ruleType'], string> = {
      UNDERWRITING: `applicant.age >= ${faker.number.int({ min: 18, max: 25 })} AND applicant.creditScore >= ${faker.number.int({ min: 600, max: 750 })}`,
      RATING: `policy.coverageLimit <= ${faker.number.int({ min: 100000, max: 1000000 })} AND policy.deductible >= ${faker.number.int({ min: 500, max: 2500 })}`,
      VALIDATION: `policy.effectiveDate IS NOT NULL AND policy.expirationDate > policy.effectiveDate`,
      ELIGIBILITY: `applicant.state IN ('CA', 'TX', 'NY', 'FL') AND applicant.yearsLicensed >= ${faker.number.int({ min: 1, max: 5 })}`,
    };

    const actionTemplates: Record<RuleData['ruleType'], string> = {
      UNDERWRITING: 'APPROVE',
      RATING: `APPLY_FACTOR(${faker.number.float({ min: 0.8, max: 1.5, fractionDigits: 2 })})`,
      VALIDATION: 'REJECT_WITH_MESSAGE("Validation failed")',
      ELIGIBILITY: 'DECLINE',
    };

    const defaults: RuleData = {
      ruleId: randomRuleId(),
      ruleName: `${faker.hacker.adjective()} ${ruleType.toLowerCase()} rule`,
      ruleType,
      priority: faker.number.int({ min: 1, max: 100 }),
      condition: conditionTemplates[ruleType],
      action: actionTemplates[ruleType],
      effectiveDate: today,
      expirationDate: futureIso(365),
      isEnabled: true,
      productCode: randomProductCode(),
      description: faker.lorem.sentence(),
    };

    return { ...defaults, ...overrides };
  }

  // -------------------------------------------------------------------------
  // buildUser
  // -------------------------------------------------------------------------

  /**
   * Return credentials for the requested role, sourced from environment
   * variables so no secrets are hardcoded.
   *
   * Expected env vars:
   *   ADMIN_USERNAME / ADMIN_PASSWORD
   *   UNDERWRITER_USERNAME / UNDERWRITER_PASSWORD
   *   AGENT_USERNAME / AGENT_PASSWORD
   *
   * @example
   *   const creds = TestDataFactory.buildUser('underwriter');
   */
  static buildUser(role: 'admin' | 'underwriter' | 'agent'): UserCredentials {
    const passwordKeyMap: Record<'admin' | 'underwriter' | 'agent', string> = {
      admin:       'ADMIN_PASSWORD',
      underwriter: 'UNDERWRITER_PASSWORD',
      agent:       'AGENT_PASSWORD',
    };

    const username = config.users[role].username;
    const rawPassword = requireEnv(passwordKeyMap[role]);

    return {
      username,
      password: resolveSecret(rawPassword),
      role,
      displayName: faker.person.fullName(),
      email: faker.internet.email(),
    };
  }
}
