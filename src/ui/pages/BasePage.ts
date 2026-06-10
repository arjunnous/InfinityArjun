// File: src/ui/pages/BasePage.ts
import { Page, Locator } from '@playwright/test'

/**
 * Shared base for every page object — holds the page, the common
 * loading-spinner locator, and the wait sequences repeated across
 * list/detail screens (spinner hidden, then network idle).
 */
export abstract class BasePage {
  // Strategy: getByTestId — targets the loading spinner overlay shown during data fetch
  readonly loadingSpinner: Locator

  constructor(protected readonly page: Page) {
    this.loadingSpinner = page.getByTestId('loading-spinner')
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle')
  }

  /** Waits for the loading spinner to disappear, then for the network to settle. */
  async waitForLoadingToFinish(): Promise<void> {
    await this.loadingSpinner.waitFor({ state: 'hidden' })
    await this.waitForNetworkIdle()
  }
}
