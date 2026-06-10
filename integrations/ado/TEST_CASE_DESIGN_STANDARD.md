# Test Case Design Standard — EAIS Automation Framework
# Applied automatically whenever test cases are created in ADO for any suite.

## Title Convention

- ALWAYS start with "Verify"
- Written in plain business language readable by QA, BA, and product owners
- NO technical prefixes like [TC-RT-10.1-001] or API jargon (POST /endpoint → 200)
- Describes the business outcome, not the HTTP call

Pattern: "Verify [what the system should do] when [condition]"

GOOD: "Verify the system rejects a premium calculation when the exposure value is zero"
BAD:  "POST /occurrences/calculate — base_exposure <= 0 → 400/422"

---

## ADO Work Item Fields

### 1. System.Title
- Starts with "Verify"
- Plain English, no TC tags, no HTTP methods in title

### 2. Custom.PreCondition
Standard 4-point pre-condition block for every test case:
  1. [Engine/Service] is running and accessible at [URL]
  2. Required prerequisites are set up (e.g. active Rate Plan created and approved)
  3. Required IDs/tokens/data are available (e.g. Rate Plan Version ID)
  4. An API testing tool (Swagger UI, Postman, or automation framework) is ready

Adapt points 2 and 3 to the specific suite/story being tested.

### 3. Custom.TestData
Structured format:
  Request Method  : POST / GET / DELETE / PATCH
  Endpoint        : [full URL including base URL]
  Key Inputs      : [important field names and values]
  Invalid Input   : [what is intentionally wrong, for negative tests]
  Expected Status : 200 OK / 400 / 422 / 404 / 405

### 4. Microsoft.VSTS.TCM.Steps (XML)
- 3 to 6 steps per test case (not too few, not too many)
- Each step has two parts: Action (what to do) and Expected Result (what should happen)
- Step type pattern:
    Steps 1 to N-1: type="ActionStep"   (setup, send request, check fields)
    Step N (last):  type="ValidateStep" (the final pass/fail check)
- Write each action as a clear instruction a manual tester can follow without reading code
- Write each expected result as an observable, verifiable outcome

XML template for each step:
  <step id="N" type="ActionStep|ValidateStep">
    <parameterizedString isformatted="true">Action text here</parameterizedString>
    <parameterizedString isformatted="true">Expected result text here</parameterizedString>
    <description/>
  </step>

### 5. Microsoft.VSTS.Common.AcceptanceCriteria
- Written as a business requirement using MUST language
- Pattern: "The system MUST [do X] when [condition Y]. The response MUST include [Z]."
- Maps directly to the acceptance criteria in the user story / QA handoff
- Includes what must NOT happen for negative test cases

---

## Test Category Approach

Design tests across these 4 categories for every suite:

| Category         | Approach                                        | Keyword in Title     |
|------------------|-------------------------------------------------|----------------------|
| Happy Path       | Valid inputs, system works correctly            | "Verify successful"  |
| Negative/Validation | Invalid inputs, system rejects with error    | "Verify the system rejects" |
| Business Rules   | Edge cases, specific business logic             | "Verify [rule]"      |
| Data Integrity   | Response echoes, uniqueness, isolation          | "Verify the response echoes / Verify unique" |

---

## Other ADO Fields to Always Set

  System.AreaPath           : Insurity EAIS AIDLC\POD3
  System.IterationPath      : Insurity EAIS AIDLC\PI-1\Sprint 2
  Custom.LLFReference       : LLF-RE1   (or relevant LLF)
  Custom.TestedRequirementID: [US or FSD reference e.g. US-14005 or FSD-21.3]
  Microsoft.VSTS.Common.Priority: 1 (critical/negative) or 2 (standard) or 3 (edge)
  System.Tags               : API; [SuiteName]; [Category]

---

## PowerShell Helper

When creating test cases via PowerShell use Invoke-WebRequest (NOT Invoke-RestMethod)
for the WI creation URL to avoid percent-encoding issues:

  $url = $base + "/_apis/wit/workitems/%24Test%20Case?api-version=7.0"
  Invoke-WebRequest -Uri $url -Method POST -Body $ops -Headers $pHdr -UseBasicParsing

For suite linking, use the path-parameter format (POST body is empty):
  $linkUrl = $base + "/_apis/test/Plans/$PLAN_ID/Suites/$SUITE_ID/TestCases/$wid?api-version=5.0"
  Invoke-WebRequest -Uri $linkUrl -Method POST -Body "" -Headers $jsonHdr -UseBasicParsing

---

## Step Count Guidelines

  Happy Path tests     : 5-6 steps (setup → send → check status → check 2-3 fields → validate)
  Negative tests       : 4 steps   (setup → send → check error status → verify error message)
  Data Integrity tests : 4-5 steps (setup → send → capture → compare → validate match)
  Business Rule tests  : 4-5 steps (setup with special input → send → check specific field → validate rule applied)
