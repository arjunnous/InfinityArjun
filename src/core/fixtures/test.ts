// File: src/core/fixtures/test.ts
//
// Shared test entry — merges the API, UI, and DB fixture sets so any spec
// can request page objects, an authenticated API client, and DB query
// helpers from a single `test` import.

import { mergeTests } from '@playwright/test';
import { test as apiTest } from '../../api/fixtures/api.fixture';
import { test as uiTest } from '../../ui/fixtures/ui.fixture';
import { test as dbTest } from '../../db/fixtures/db.fixture';

export const test = mergeTests(apiTest, uiTest, dbTest);
export { expect } from '@playwright/test';
