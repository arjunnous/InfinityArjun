// File: helpers/rules-helper.ts

import type { Page, APIRequestContext } from '@playwright/test';
import { RuleListPage } from '@pages/rules/RuleListPage';
import { RuleEditorPage } from '@pages/rules/RuleEditorPage';
import { NavigationPage } from '@pages/common/NavigationPage';
import type { RuleData } from '@utils/test-data-factory';

// ---------------------------------------------------------------------------
// createRule
// ---------------------------------------------------------------------------

/**
 * Navigate to the Rules Engine list, open the Rule Editor, fill every field
 * with the supplied RuleData, save the rule, and return the generated rule ID
 * read from the confirmation element on the editor page.
 *
 * Pre-condition : the page must already be authenticated.
 * Post-condition: the page is on the saved Rule Editor screen.
 *
 * @param page - Playwright Page that is already authenticated.
 * @param data - Fully-populated RuleData object (use TestDataFactory.buildRule).
 * @returns      The rule ID string extracted from the ruleIdLabel element.
 */
export async function createRule(
  page: Page,
  data: RuleData,
): Promise<string> {
  const nav = new NavigationPage(page);
  const listPage = new RuleListPage(page);
  const editorPage = new RuleEditorPage(page);

  // Navigate to the Rules module
  await nav.goToRules();
  await nav.waitForNavigation();

  await listPage.waitForResults();
  await listPage.clickNewRule();

  // Wait for the Rule Editor form to be ready
  await editorPage.pageTitle.waitFor({ state: 'visible' });
  await editorPage.waitForPageLoad();

  // Populate the rule form
  await editorPage.fillRuleName(data.ruleName);
  await editorPage.selectRuleType(data.ruleType);
  await editorPage.fillCondition(data.condition);
  await editorPage.fillAction(data.action);

  // Fill additional standard fields that exist outside the page-object methods
  // (priority, effective date, expiration date, description, product code)
  const priorityInput = page.getByLabel('Priority');
  const priorityVisible = await priorityInput.isVisible().catch(() => false);
  if (priorityVisible) {
    await priorityInput.fill(String(data.priority));
  }

  const effectiveDateInput = page.getByLabel('Effective Date');
  const effectiveDateVisible = await effectiveDateInput.isVisible().catch(() => false);
  if (effectiveDateVisible) {
    await effectiveDateInput.fill(data.effectiveDate);
  }

  const expirationDateInput = page.getByLabel('Expiration Date');
  const expirationDateVisible = await expirationDateInput.isVisible().catch(() => false);
  if (expirationDateVisible) {
    await expirationDateInput.fill(data.expirationDate);
  }

  const descriptionInput = page.getByLabel('Description');
  const descriptionVisible = await descriptionInput.isVisible().catch(() => false);
  if (descriptionVisible) {
    await descriptionInput.fill(data.description);
  }

  const productCodeInput = page.getByLabel('Product Code');
  const productCodeVisible = await productCodeInput.isVisible().catch(() => false);
  if (productCodeVisible) {
    await productCodeInput.fill(data.productCode);
  }

  // Enable the rule via toggle / checkbox if present
  const enabledToggle = page.getByLabel('Enabled');
  const enabledVisible = await enabledToggle.isVisible().catch(() => false);
  if (enabledVisible) {
    const isChecked = await enabledToggle.isChecked().catch(() => false);
    if (data.isEnabled && !isChecked) {
      await enabledToggle.check();
    } else if (!data.isEnabled && isChecked) {
      await enabledToggle.uncheck();
    }
  }

  // Save the rule and wait for the rule ID element to appear
  await editorPage.clickSave();

  await editorPage.ruleIdLabel.waitFor({ state: 'visible' });

  const ruleId = await editorPage.getRuleId();

  if (!ruleId) {
    throw new Error(
      '[createRule] Rule ID was empty after saving. ' +
        'The application may not have confirmed the creation.',
    );
  }

  return ruleId.trim();
}

// ---------------------------------------------------------------------------
// evaluateRule
// ---------------------------------------------------------------------------

export async function evaluateRule(
  apiClient: APIRequestContext,
  ruleId: string,
  input: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const url = `/api/rules/${encodeURIComponent(ruleId)}/evaluate`;

  const response = await apiClient.post(url, {
    data: input,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  const body = await response.json().catch(() => response.text());

  if (!response.ok()) {
    throw new Error(
      `[evaluateRule] Rules Engine evaluation failed — HTTP ${response.status()} for ruleId "${ruleId}": ${JSON.stringify(body)}`,
    );
  }

  return { status: response.status(), body };
}

// ---------------------------------------------------------------------------
// createRatingTable
// ---------------------------------------------------------------------------

/**
 * Navigate to the Rating Tables section within the Rules module, create a new
 * table using the supplied `data`, save it, and return the generated table ID.
 *
 * The function expects the Rules module to contain a "Rating Tables" sub-section
 * accessible via a link or tab with the accessible name "Rating Tables".
 *
 * @param page - Playwright Page that is already authenticated.
 * @param data - Key/value map of rating table fields.
 *               Common keys: `tableName`, `tableType`, `description`, `productCode`.
 * @returns      The table ID string extracted from the page after saving.
 */
export async function createRatingTable(
  page: Page,
  data: Record<string, unknown>,
): Promise<string> {
  const nav = new NavigationPage(page);

  // Navigate to Rules module
  await nav.goToRules();
  await nav.waitForNavigation();

  // Locate and click the Rating Tables sub-navigation item
  const ratingTablesLink = page.getByRole('link', { name: 'Rating Tables' });
  const ratingTablesTab = page.getByRole('tab', { name: 'Rating Tables' });

  const linkVisible = await ratingTablesLink.isVisible().catch(() => false);
  const tabVisible = await ratingTablesTab.isVisible().catch(() => false);

  if (linkVisible) {
    await ratingTablesLink.click();
  } else if (tabVisible) {
    await ratingTablesTab.click();
  } else {
    throw new Error(
      '[createRatingTable] Could not find a "Rating Tables" link or tab in the Rules module.',
    );
  }

  await page.waitForLoadState('networkidle');

  // Click the New Rating Table button
  const newTableBtn = page.getByRole('button', { name: 'New Rating Table' });
  await newTableBtn.waitFor({ state: 'visible' });
  await newTableBtn.click();

  await page.waitForLoadState('networkidle');

  // Fill the rating table form fields using the provided data map
  for (const [fieldLabel, fieldValue] of Object.entries(data)) {
    const input = page.getByLabel(fieldLabel);
    const inputVisible = await input.isVisible().catch(() => false);

    if (!inputVisible) {
      console.warn(
        `[createRatingTable] Field with label "${fieldLabel}" was not found on the page. ` +
          'Skipping.',
      );
      continue;
    }

    const tagName = await input.evaluate(
      (el) => (el as HTMLElement).tagName.toLowerCase(),
    );

    if (tagName === 'select') {
      await input.selectOption(String(fieldValue));
    } else if (tagName === 'textarea') {
      await input.fill(String(fieldValue));
    } else {
      await input.fill(String(fieldValue));
    }
  }

  // Save the rating table
  const saveBtn = page.getByRole('button', { name: 'Save' });
  await saveBtn.waitFor({ state: 'visible' });
  await saveBtn.click();

  await page.waitForLoadState('networkidle');

  // Extract the table ID from the page: try a dedicated label first, then URL
  const tableIdLabel = page.getByTestId('table-id-label');
  const tableIdVisible = await tableIdLabel.isVisible().catch(() => false);

  if (tableIdVisible) {
    const labelText = (await tableIdLabel.textContent()) ?? '';
    if (labelText.trim()) {
      return labelText.trim();
    }
  }

  // Fallback: extract from URL path /rating-tables/<id>
  const url = page.url();
  const urlMatch = url.match(/\/rating-tables\/([^/?#]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  throw new Error(
    '[createRatingTable] Could not extract the table ID from the page label or URL ' +
      `after saving. Current URL: ${url}`,
  );
}
