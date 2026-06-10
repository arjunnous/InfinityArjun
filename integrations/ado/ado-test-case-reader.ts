// File: integrations/ado/ado-test-case-reader.ts
import * as azdev from 'azure-devops-node-api';
import * as fs from 'fs';
import * as path from 'path';
import { extractTcId } from '../../src/core/utils/tc-tag';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface TestCaseItem {
  id: number;        // ADO work-item ID  ← always the primary key
  tcTag?: string;    // extracted from title e.g. "TC-4.3-001" or "TC-17461"
  title: string;
  state: string;
  steps: TestStep[];
  automationStatus: string;
  priority?: string;
  areaPath?: string;
  tags?: string[];
}

export interface TestStep {
  action: string;
  expected: string;
}

export interface SuiteItem {
  id: number;
  name: string;
  parentSuiteId?: number;
}

// ---------------------------------------------------------------------------
// AdoTestCaseReader
// ---------------------------------------------------------------------------
export class AdoTestCaseReader {
  constructor(
    private readonly connection: azdev.WebApi,
    private readonly projectName: string
  ) {}

  /**
   * Retrieve all test cases for a given plan+suite via TestPlanApi + WorkItemTracking.
   */
  async getTestCases(planId: number, suiteId: number): Promise<TestCaseItem[]> {
    const testPlanApi = await this.connection.getTestPlanApi();
    const witApi = await this.connection.getWorkItemTrackingApi();
    const allCases: TestCaseItem[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      const page = await testPlanApi.getTestCaseList(
        this.projectName,
        planId,
        suiteId,
        undefined,  // testIds
        undefined,  // configurationIds
        undefined,  // witFields
        continuationToken,
        false,      // returnIdentityRef
        true,       // expand
      );

      if (!page || page.length === 0) break;

      const items = Array.isArray(page) ? page : (page as any).value ?? [];
      if (items.length === 0) break;

      // ── Extract test case IDs from the correct path ──────────────────────
      // Correct path per ADO REST API: response.value[i].testCase.id
      // Fallback: workItem.id (same work-item ID, different SDK property name)
      const workItemIds: number[] = items
        .map((tc: any) => {
          const tcId  = parseInt(String(tc.testCase?.id  ?? 0), 10);
          const wiId  = parseInt(String(tc.workItem?.id  ?? 0), 10);
          // testCase.id is always 0 in the Node SDK (SDK wrapping bug) — workItem.id is correct.
          // workItem.id == "TEST CASE <ID>" shown in the ADO Test Plan UI.
          const resolved = tcId > 0 ? tcId : wiId;
          console.log(
            `[DEBUG ADO reader] SDK testCase.id=${tcId} (SDK bug: always 0)` +
            `  workItem.id=${wiId}  → using ${resolved} as ADO Test Case ID`
          );
          return resolved;
        })
        .filter((id: number) => id > 0);

      if (workItemIds.length > 0) {
        const workItems = await witApi.getWorkItems(
          workItemIds,
          [
            'System.Title',
            'System.State',
            'Microsoft.VSTS.TCM.Steps',
            'Microsoft.VSTS.TCM.AutomationStatus',
            'Microsoft.VSTS.Common.Priority',
            'System.AreaPath',
            'System.Tags',
          ],
        );

        for (const wi of workItems ?? []) {
          const f     = wi.fields ?? {};
          const steps = this.parseSteps(f['Microsoft.VSTS.TCM.Steps'] ?? '');
          const rawTags: string = f['System.Tags'] ?? '';
          const title = f['System.Title'] ?? '';

          // Extract TC tag from the work-item title (e.g. "TC-4.3-001: …" → "TC-4.3-001")
          const tcTag = extractTcId(title) ?? undefined;

          console.log(
            `[DEBUG ADO reader] id=${wi.id}  tcTag=${tcTag ?? '(none)'}  title="${title.slice(0, 60)}"`
          );

          allCases.push({
            id: wi.id ?? 0,
            tcTag,
            title,
            state: f['System.State'] ?? 'Unknown',
            steps,
            automationStatus: f['Microsoft.VSTS.TCM.AutomationStatus'] ?? 'Not Automated',
            priority: f['Microsoft.VSTS.Common.Priority']
              ? String(f['Microsoft.VSTS.Common.Priority'])
              : undefined,
            areaPath: f['System.AreaPath'] ?? undefined,
            tags: rawTags ? rawTags.split(';').map(t => t.trim()).filter(Boolean) : [],
          });
        }
      }

      // PagedList carries continuationToken; plain arrays do not
      continuationToken = (page as any).continuationToken ?? undefined;
    } while (continuationToken);

    return allCases;
  }

  /**
   * Retrieve all test suites for a test plan via TestPlanApi.
   */
  async getTestSuites(planId: number): Promise<SuiteItem[]> {
    const testPlanApi = await this.connection.getTestPlanApi();
    const result: SuiteItem[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      const page = await testPlanApi.getTestSuitesForPlan(
        this.projectName,
        planId,
        undefined,       // expand
        continuationToken,
        true,            // asTreeView
      );

      if (!page || page.length === 0) break;

      const items = Array.isArray(page) ? page : (page as any).value ?? [];

      for (const s of items) {
        result.push({
          id: s.id ?? 0,
          name: s.name ?? '',
          parentSuiteId: s.parentSuite?.id,
        });
      }

      continuationToken = (page as any).continuationToken ?? undefined;
    } while (continuationToken);

    return result;
  }

  /**
   * Export test case items to a JSON file.
   */
  async exportToJson(cases: TestCaseItem[], filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(cases, null, 2), 'utf8');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse ADO step XML into action/expected pairs.
   * ADO format:
   *   <steps id="0">
   *     <step id="1" type="ActionStep">
   *       <parameterizedString>Action text</parameterizedString>
   *       <parameterizedString>Expected text</parameterizedString>
   *     </step>
   *   </steps>
   */
  private parseSteps(stepsXml: string): TestStep[] {
    if (!stepsXml) return [];

    const steps: TestStep[] = [];
    const stepBlockRe = /<step[^>]*>([\s\S]*?)<\/step>/g;
    let stepMatch: RegExpExecArray | null;

    while ((stepMatch = stepBlockRe.exec(stepsXml)) !== null) {
      const content = stepMatch[1];
      const paramRe = /<parameterizedString[^>]*isformatted="true"[^>]*>([\s\S]*?)<\/parameterizedString>/gi;
      const parts: string[] = [];
      let paramMatch: RegExpExecArray | null;

      while ((paramMatch = paramRe.exec(content)) !== null) {
        const text = this.stripHtml(paramMatch[1]).trim();
        if (text) parts.push(text);
      }

      // Fallback: plain parameterizedString without isformatted attr
      if (parts.length === 0) {
        const fallbackRe = /<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>/gi;
        let fb: RegExpExecArray | null;
        while ((fb = fallbackRe.exec(content)) !== null) {
          const text = this.stripHtml(fb[1]).trim();
          if (text) parts.push(text);
        }
      }

      steps.push({
        action: parts[0] ?? '',
        expected: parts[1] ?? '',
      });
    }

    return steps;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}
