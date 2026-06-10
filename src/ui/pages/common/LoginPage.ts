// File: pages/common/LoginPage.ts
import { Page, Locator } from '@playwright/test'
import { BasePage } from '../BasePage'

export class LoginPage extends BasePage {
  // Strategy: getByLabel — targets the username input field by its associated label text
  readonly usernameInput: Locator

  // Strategy: getByLabel — targets the password input field by its associated label text
  readonly passwordInput: Locator

  // Strategy: getByRole — targets the sign-in button by its button role and accessible name
  readonly signInBtn: Locator

  // Strategy: getByRole — targets the error alert region rendered on failed login
  readonly errorMessage: Locator

  // Strategy: getByRole — targets the main dashboard heading that confirms successful login
  readonly dashboardIndicator: Locator

  constructor(page: Page) {
    super(page)
    this.usernameInput = page.getByLabel('Username')
    this.passwordInput = page.getByLabel('Password')
    this.signInBtn = page.getByRole('button', { name: 'Sign In' })
    this.errorMessage = page.getByRole('alert')
    this.dashboardIndicator = page.getByRole('heading', { name: 'Dashboard' })
  }

  async fillUsername(value: string): Promise<void> {
    await this.usernameInput.fill(value)
  }

  async fillPassword(value: string): Promise<void> {
    await this.passwordInput.fill(value)
  }

  async clickSignIn(): Promise<void> {
    await this.signInBtn.click()
  }

  async waitForDashboard(): Promise<void> {
    await this.dashboardIndicator.waitFor({ state: 'visible' })
  }

  async getErrorMessage(): Promise<string> {
    return (await this.errorMessage.textContent()) ?? ''
  }
}
