// File: pages/common/NavigationPage.ts
import { Page, Locator } from '@playwright/test'
import { BasePage } from '../BasePage'

export class NavigationPage extends BasePage {
  // Strategy: getByRole — targets the PAS navigation link by its link role and accessible name
  readonly pasNavLink: Locator

  // Strategy: getByRole — targets the PC (Product Configuration) navigation link by its link role and accessible name
  readonly pcNavLink: Locator

  // Strategy: getByRole — targets the Rules navigation link by its link role and accessible name
  readonly rulesNavLink: Locator

  // Strategy: getByTestId — targets the label that displays the currently active module name
  readonly currentModuleLabel: Locator

  // Strategy: getByRole — targets the user menu button by its button role and accessible name
  readonly userMenuBtn: Locator

  constructor(page: Page) {
    super(page)
    this.pasNavLink = page.getByRole('link', { name: 'PAS' })
    this.pcNavLink = page.getByRole('link', { name: 'PC' })
    this.rulesNavLink = page.getByRole('link', { name: 'Rules' })
    this.currentModuleLabel = page.getByTestId('current-module-label')
    this.userMenuBtn = page.getByRole('button', { name: 'User Menu' })
  }

  async goToPAS(): Promise<void> {
    await this.pasNavLink.click()
  }

  async goToPC(): Promise<void> {
    await this.pcNavLink.click()
  }

  async goToRules(): Promise<void> {
    await this.rulesNavLink.click()
  }

  async getCurrentModule(): Promise<string> {
    return (await this.currentModuleLabel.textContent()) ?? ''
  }

  async waitForNavigation(): Promise<void> {
    await this.waitForNetworkIdle()
  }
}
