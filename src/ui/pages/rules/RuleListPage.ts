// File: pages/rules/RuleListPage.ts
import { Page, Locator } from '@playwright/test'
import { BasePage } from '../BasePage'

export class RuleListPage extends BasePage {
  // Strategy: getByRole — targets the New Rule button by its button role and accessible name
  readonly newRuleBtn: Locator

  // Strategy: getByPlaceholder — targets the search input by its placeholder text
  readonly searchInput: Locator

  // Strategy: getByRole — targets the Search submit button by its button role and accessible name
  readonly searchBtn: Locator

  // Strategy: getByRole — targets the first data row in the rules results table
  readonly firstResultRow: Locator

  constructor(page: Page) {
    super(page)
    this.newRuleBtn = page.getByRole('button', { name: 'New Rule' })
    this.searchInput = page.getByPlaceholder('Search by rule name')
    this.searchBtn = page.getByRole('button', { name: 'Search' })
    this.firstResultRow = page.getByRole('row').nth(1)
  }

  async clickNewRule(): Promise<void> {
    await this.newRuleBtn.click()
  }

  async searchByName(value: string): Promise<void> {
    await this.searchInput.fill(value)
    await this.searchBtn.click()
  }

  async getFirstResult(): Promise<string> {
    return (await this.firstResultRow.textContent()) ?? ''
  }

  async waitForResults(): Promise<void> {
    await this.waitForLoadingToFinish()
  }
}
