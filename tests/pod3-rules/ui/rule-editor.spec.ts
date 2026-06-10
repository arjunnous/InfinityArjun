// File: tests/pod3-rules/ui/rule-editor.spec.ts

import { test, expect } from '@fixtures/test';
import { createRule, evaluateRule } from '@helpers/rules-helper';

test.describe('@pod3 Rule Editor', () => {

  test('TC-POD3-001: Create rule happy path', async ({
    authenticatedPage,
    testData,
  }) => {
    const ruleData = testData.buildRule();
    let ruleId: string;

    await test.step('Navigate to Rule Editor page', async () => {
      await authenticatedPage.goto('/rules/new');
      await expect(authenticatedPage.locator('h1')).toContainText('Rule Editor');
    });

    await test.step('Create rule using helper', async () => {
      ruleId = await createRule(authenticatedPage, ruleData);
    });

    await test.step('Verify rule ID is returned', async () => {
      expect(ruleId).toBeTruthy();
      expect(ruleId.length).toBeGreaterThan(0);
    });

    await test.step('Verify rule appears in rule list', async () => {
      await authenticatedPage.goto('/rules');
      await expect(
        authenticatedPage.locator(`[data-testid="rule-row-${ruleId}"]`),
      ).toBeVisible();
    });

    await test.step('Verify rule name and status on list page', async () => {
      const nameCell = authenticatedPage.locator(
        `[data-testid="rule-row-${ruleId}"] [data-testid="rule-name"]`,
      );
      await expect(nameCell).toHaveText(ruleData.name);

      const statusCell = authenticatedPage.locator(
        `[data-testid="rule-row-${ruleId}"] [data-testid="rule-status"]`,
      );
      await expect(statusCell).toHaveText('ACTIVE');
    });
  });

  test('TC-POD3-002: Evaluate rule via API', async ({
    authenticatedPage,
    apiClient,
    testData,
  }) => {
    const ruleData = testData.buildRule();
    let ruleId: string;
    let evaluationResult: Awaited<ReturnType<typeof evaluateRule>>;

    await test.step('Create a rule via UI to evaluate', async () => {
      await authenticatedPage.goto('/rules/new');
      ruleId = await createRule(authenticatedPage, ruleData);
      expect(ruleId).toBeTruthy();
    });

    await test.step('Evaluate rule via API using evaluateRule helper', async () => {
      evaluationResult = await evaluateRule(apiClient, ruleId, testData.buildRuleInput());
    });

    await test.step('Assert evaluation response status is 200', async () => {
      expect(evaluationResult.status).toBe(200);
    });

    await test.step('Assert evaluation result body contains outcome', async () => {
      const body = evaluationResult.body as Record<string, unknown>;
      expect(body).toHaveProperty('ruleId');
      expect(body).toHaveProperty('outcome');
      expect(body).toHaveProperty('matchedConditions');
      expect(body['ruleId']).toBe(ruleId);
    });

    await test.step('Assert evaluation outcome is a known value', async () => {
      const body = evaluationResult.body as Record<string, unknown>;
      expect(['PASS', 'FAIL', 'SKIPPED']).toContain(body['outcome']);
    });
  });
});
