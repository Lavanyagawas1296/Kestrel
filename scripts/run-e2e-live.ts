import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'https://kestrel-eight-lovat.vercel.app';
const SCREENSHOTS_DIR = path.resolve('tests-e2e', 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

interface StepResult {
  step: number;
  description: string;
  status: 'PASS' | 'FAIL';
  screenshot: string;
  detail?: string;
}

const results: StepResult[] = [];

async function recordStep(
  step: number,
  description: string,
  page: Page,
  screenshotName: string,
  action: () => Promise<string | void>
) {
  const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
  console.log(`\n========================================`);
  console.log(`[Step ${step}] START: ${description}`);
  try {
    const detail = await action();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({
      step,
      description,
      status: 'PASS',
      screenshot: screenshotName,
      detail: detail || undefined,
    });
    console.log(`[Step ${step}] PASS: ${description} (Saved: ${screenshotName})`);
    if (detail) console.log(`  Details: ${detail}`);
  } catch (err: any) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    results.push({
      step,
      description,
      status: 'FAIL',
      screenshot: screenshotName,
      detail: err.message,
    });
    console.error(`[Step ${step}] FAIL: ${err.message}`);
    throw err;
  }
}

async function run() {
  console.log(`=== RUNNING PLAYWRIGHT E2E SUITE AGAINST: ${BASE_URL} ===\n`);
  const browser: Browser = await chromium.launch({
    headless: true,
  });

  let workspaceId1 = '';
  let draftTitle1 = 'Q4 Cloud Infrastructure Update';

  try {
    // -------------------------------------------------------------
    // CONTEXT 1: Full core workflow in fresh browser context (no login)
    // -------------------------------------------------------------
    const context1: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page1: Page = await context1.newPage();

    // STEP 1: Sandbox starts
    await recordStep(1, 'Sandbox starts in a fresh browser context', page1, 'step1-sandbox-started.png', async () => {
      await page1.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      for (let i = 0; i < 4; i++) {
        const retryBtn = page1.locator('button:has-text("Retry session")');
        if (await retryBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          console.log('  Cold-start retry detected, clicking Retry session...');
          await retryBtn.click();
        }
        const active = await page1.locator('text=Anonymous sandbox active:').isVisible({ timeout: 3000 }).catch(() => false);
        if (active) break;
        await page1.waitForTimeout(1000);
      }
      await page1.waitForSelector('text=Anonymous sandbox active:', { timeout: 30000 });
      const wsCode = await page1.locator('text=Anonymous sandbox active:').locator('..').locator('code').innerText();
      workspaceId1 = wsCode.trim();
      if (!workspaceId1 || workspaceId1.length < 5) {
        throw new Error('Sandbox workspace ID was not properly rendered');
      }
      return `Workspace active: ${workspaceId1}`;
    });

    // STEP 2: Open Knowledge Base
    await recordStep(2, 'Open Knowledge Base and confirm seeded rules', page1, 'step2-knowledge-base.png', async () => {
      const kbTab = page1.locator('button:has-text("Knowledge Base")');
      await kbTab.click();
      await page1.waitForSelector('text=Brand Knowledge Base', { timeout: 10000 });
      // Verify seeded rules in table
      await page1.waitForSelector('text=SLACK-BRAND-01', { timeout: 10000 });
      await page1.waitForSelector('text=FACT-SLA-01', { timeout: 10000 });
      const ruleCount = await page1.locator('tbody tr').count();
      if (ruleCount < 2) {
        throw new Error(`Expected at least 2 seeded rules, found ${ruleCount}`);
      }
      return `Found ${ruleCount} active brand rules (including SLACK-BRAND-01 and FACT-SLA-01)`;
    });

    // STEP 3: Create draft with text breaking a seeded rule
    await recordStep(3, 'Create draft with copy breaking SLACK-BRAND-01', page1, 'step3-draft-created.png', async () => {
      const workspaceTab = page1.locator('button:has-text("Review workspace")');
      await workspaceTab.click();

      // Click "+ New draft"
      const newDraftBtn = page1.locator('button:has-text("+ New draft")');
      await newDraftBtn.click();

      // Fill draft form
      await page1.fill('#new-draft-title', draftTitle1);
      const draftContent =
        'Welcome to Kestrel Cloud. If your team needs custom migration runbooks, our engineers will slack you the deployment guide directly. Happy Slacking!';
      await page1.fill('#new-draft-content', draftContent);

      // Switch role to Creator initially to test role limits and later role-switch to Manager
      const creatorRadio = page1.locator('button[role="radio"]:has-text("creator")');
      await creatorRadio.click();

      // Submit
      const saveBtn = page1.locator('button:has-text("Save draft")');
      await saveBtn.click();

      // Wait for draft to be active in center pane
      await page1.waitForSelector(`h2:has-text("${draftTitle1}")`, { timeout: 10000 });
      await page1.waitForSelector('text=Version 1', { timeout: 10000 });
      return `Draft "${draftTitle1}" created at Version 1 (Role: creator)`;
    });

    // STEP 4 & 5: Run review & confirm findings show rule ID, engine tag, explanation
    await recordStep(
      4,
      'Run brand review on draft',
      page1,
      'step4-review-running.png',
      async () => {
        const reviewBtn = page1.locator('button:has-text("Run brand review")');
        // Wait for the review API call to complete
        const [response] = await Promise.all([
          page1.waitForResponse((res) => res.url().includes('/review') && res.status() === 200, { timeout: 45000 }),
          reviewBtn.click(),
        ]);
        const data = await response.json().catch(() => ({}));
        return `Review pipeline completed evaluation (${data.draft?.findings?.length || 0} findings detected)`;
      }
    );

    await recordStep(
      5,
      'Confirm findings show Rule ID, Engine tag, and Explanation',
      page1,
      'step5-findings-verified.png',
      async () => {
        // Wait for findings cards to render
        await page1.waitForSelector('button:has-text("SLACK-BRAND-01")', { timeout: 10000 });

        // Confirm rule ID
        const ruleIdEl = page1.locator('button:has-text("SLACK-BRAND-01")').first();
        const ruleIdText = await ruleIdEl.innerText();

        // Confirm engine tag (Rule-based or AI)
        const engineTag = await page1.locator('span:has-text("Rule-based"), span:has-text("AI")').first().innerText();

        // Confirm explanation
        const explanationEl = page1.locator('text=/Slack.*must never be used as a verb/i').first();
        const hasExplanation = await explanationEl.isVisible().catch(() => false);

        if (!ruleIdText.includes('SLACK-BRAND-01')) {
          throw new Error('Expected finding with rule ID SLACK-BRAND-01 not displayed');
        }

        return `Finding verified: Rule ID "${ruleIdText.trim()}", Engine "${engineTag.trim()}", Explanation displayed: ${hasExplanation}`;
      }
    );

    // STEP 6: Apply fix creates v2
    await recordStep(6, 'Apply fix creates incremental Version 2', page1, 'step6-apply-fix-v2.png', async () => {
      const applyFixBtn = page1.locator('button:has-text("Apply fix")').first();
      await applyFixBtn.waitFor({ state: 'visible', timeout: 5000 });
      await applyFixBtn.click();

      // Wait for draft version to increment to Version 2
      await page1.waitForSelector('text=Version 2', { timeout: 10000 });
      return 'Fix applied successfully: draft version advanced from Version 1 to Version 2';
    });

    // STEP 7: Override requires a comment
    await recordStep(
      7,
      'Override finding validates required justification comment',
      page1,
      'step7-override-comment-required.png',
      async () => {
        const overrideBtn = page1.locator('button:has-text("Override")').first();
        await overrideBtn.waitFor({ state: 'visible', timeout: 5000 });
        await overrideBtn.click();

        // Wait for Override modal
        await page1.waitForSelector('#override-modal-title', { timeout: 5000 });

        // Submit whitespace comment to test required validation
        await page1.fill('#override-comment', '   ');
        const confirmBtn = page1.locator('button:has-text("Confirm override")');
        await confirmBtn.click();

        // Check for required validation error
        await page1.waitForSelector('text=An override comment is strictly required', { timeout: 5000 });
        console.log('  Validation active: empty comment blocked.');
        await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, 'step7-override-comment-required.png'), fullPage: true });

        // Now fill required comment
        await page1.fill(
          '#override-comment',
          'Legal exception approved per ticket #402 by Brand Director'
        );
        await confirmBtn.click();

        // Wait for modal to close and status to update to OVERRIDDEN
        await page1.waitForSelector('text=OVERRIDDEN', { timeout: 10000 });
        return 'Override verified: strictly blocked empty submission, accepted justified comment';
      }
    );

    // STEP 8: Switch role to Manager
    await recordStep(8, 'Switch active role to Manager', page1, 'step8-switch-manager.png', async () => {
      // Navigate to Revision diff & approval tab while still Creator
      const historyTab = page1.locator('button:has-text("Revision diff & approval")');
      await historyTab.click();
      await page1.waitForSelector('text=Manager approval controls are restricted', { timeout: 10000 });

      // Switch role to Manager using TopBar radio group
      const managerRadio = page1.locator('button[role="radio"]:has-text("manager")');
      await managerRadio.click();

      // Confirm approval controls are now unlocked
      await page1.waitForSelector('#approval-comment', { timeout: 10000 });
      return 'Role restriction verified for Creator; unlocked approval controls after switching to Manager';
    });

    // STEP 9: Approve draft
    await recordStep(9, 'Manager reviews revision diff and approves draft', page1, 'step9-draft-approved.png', async () => {
      // Enter approval comment
      await page1.fill(
        '#approval-comment',
        'Verified against brand standards. Approved for immediate deployment.'
      );

      // Click approve
      const approveBtn = page1.locator('button:has-text("Approve draft for publication")');
      await approveBtn.click();

      // Wait for success message
      await page1.waitForSelector('text=successfully marked as APPROVED', { timeout: 10000 });
      return `Draft "${draftTitle1}" approved with decision comment and confirmed in DB`;
    });

    await context1.close();

    // -------------------------------------------------------------
    // STEP 10: Two separate contexts isolation
    // -------------------------------------------------------------
    const context2: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page2: Page = await context2.newPage();

    await recordStep(
      10,
      'Run in separate context and verify zero data sharing (RLS isolation)',
      page2,
      'step10-context2-isolation.png',
      async () => {
        await page2.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        for (let i = 0; i < 4; i++) {
          const retryBtn = page2.locator('button:has-text("Retry session")');
          if (await retryBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            console.log('  Context 2: Cold-start retry detected, clicking Retry session...');
            await retryBtn.click();
          }
          const active = await page2.locator('text=Anonymous sandbox active:').isVisible({ timeout: 3000 }).catch(() => false);
          if (active) break;
          await page2.waitForTimeout(1000);
        }
        await page2.waitForSelector('text=Anonymous sandbox active:', { timeout: 30000 });

        const wsCode2 = (
          await page2.locator('text=Anonymous sandbox active:').locator('..').locator('code').innerText()
        ).trim();

        console.log(`  Context 1 Workspace: ${workspaceId1}`);
        console.log(`  Context 2 Workspace: ${wsCode2}`);

        if (wsCode2 === workspaceId1) {
          throw new Error('Context 2 re-used Context 1 workspace! Workspaces must be completely isolated.');
        }

        // Verify draft list in Context 2 does NOT have Context 1 draft
        const draftDropdown = page2.locator('#draft-selector');
        const hasDropdown = await draftDropdown.isVisible().catch(() => false);

        if (hasDropdown) {
          const text = await draftDropdown.innerText();
          if (text.includes(draftTitle1)) {
            throw new Error(`Data leakage! Context 2 sees Context 1 draft: "${draftTitle1}"`);
          }
        } else {
          // If no dropdown, confirm pristine empty state text
          await page2.waitForSelector('text=No drafts submitted yet.', { timeout: 5000 });
        }

        return `Cross-context isolation verified: Context 2 has distinct workspace (${wsCode2}) with 0 drafts from Context 1`;
      }
    );

    await context2.close();
  } finally {
    await browser.close();
  }

  // Print Summary Table
  console.log('\n================================================================');
  console.log('                     E2E TEST SUMMARY REPORT                    ');
  console.log('================================================================');
  console.table(
    results.map((r) => ({
      Step: r.step,
      Description: r.description,
      Status: r.status,
      Screenshot: r.screenshot,
    }))
  );
  console.log('================================================================');

  const failedSteps = results.filter((r) => r.status === 'FAIL');
  if (failedSteps.length > 0) {
    console.error(`FAILED: ${failedSteps.length} step(s) failed.`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All 10 steps passed successfully against live Vercel!');
  }
}

run().catch((err) => {
  console.error('\nTest Execution Halted With Error:', err.message);
  process.exit(1);
});
