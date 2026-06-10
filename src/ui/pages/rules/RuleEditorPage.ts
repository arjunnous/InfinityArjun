// File: pages/rules/RuleEditorPage.ts
import { Page, Locator } from '@playwright/test'
import { BasePage } from '../BasePage'

export class RuleEditorPage extends BasePage {
  // Strategy: getByLabel — targets the rule name text input by its associated label
  readonly ruleNameInput: Locator

  // Strategy: getByLabel — targets the rule type dropdown by its associated label
  readonly ruleTypeSelect: Locator

  // Strategy: getByTestId — targets the condition code editor panel by its test ID
  readonly conditionEditor: Locator

  // Strategy: getByTestId — targets the action code editor panel by its test ID
  readonly actionEditor: Locator

  // Strategy: getByRole — targets the Save button by its button role and accessible name
  readonly saveBtn: Locator

  // Strategy: getByRole — targets the Test button by its button role and accessible name
  readonly testBtn: Locator

  // Strategy: getByTestId — targets the element that displays the generated rule ID
  readonly ruleIdLabel: Locator

  // Strategy: getByRole — targets the main page heading for the rule editor
  readonly pageTitle: Locator

  constructor(page: Page) {
    super(page)
    this.ruleNameInput = page.getByLabel('Rule Name')
    this.ruleTypeSelect = page.getByLabel('Rule Type')
    this.conditionEditor = page.getByTestId('condition-editor')
    this.actionEditor = page.getByTestId('action-editor')
    this.saveBtn = page.getByRole('button', { name: 'Save' })
    this.testBtn = page.getByRole('button', { name: 'Test' })
    this.ruleIdLabel = page.getByTestId('rule-id-label')
    this.pageTitle = page.getByRole('heading', { name: 'Rule Editor' })
  }

  async fillRuleName(value: string): Promise<void> {
    await this.ruleNameInput.fill(value)
  }

  async selectRuleType(value: string): Promise<void> {
    await this.ruleTypeSelect.selectOption(value)
  }

  async fillCondition(value: string): Promise<void> {
    await this.conditionEditor.fill(value)
  }

  async fillAction(value: string): Promise<void> {
    await this.actionEditor.fill(value)
  }

  async clickSave(): Promise<void> {
    await this.saveBtn.click()
  }

  async clickTest(): Promise<void> {
    await this.testBtn.click()
  }

  async getRuleId(): Promise<string> {
    return (await this.ruleIdLabel.textContent()) ?? ''
  }

  async waitForPageLoad(): Promise<void> {
    await this.waitForNetworkIdle()
  }
}
