/**
 * Gate check: read docs/excel-feasibility.md, parse the verdict block, and
 * exit 1 if verdict is "escalate" — blocking Phase 3 until re-planning is done.
 *
 * Usage: node --experimental-strip-types scripts/check-excel-verdict.ts
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MEMO_PATH = resolve(process.cwd(), 'docs/excel-feasibility.md');

type Verdict = 'proceed' | 'proceed-with-fallback' | 'escalate';

async function parseVerdict(content: string): Promise<Verdict | null> {
  // Verdict block in memo looks like:
  //   ```
  //   proceed
  //   ```
  // located under the "## Verdict" heading.
  const verdictSection = content.match(/## Verdict[\s\S]*?```\s*([\w-]+)\s*```/);
  if (!verdictSection) return null;
  const raw = verdictSection[1].trim();
  if (raw === 'proceed' || raw === 'proceed-with-fallback' || raw === 'escalate') {
    return raw as Verdict;
  }
  return null;
}

async function main(): Promise<void> {
  let content: string;
  try {
    content = await readFile(MEMO_PATH, 'utf-8');
  } catch {
    console.error(`ERROR: ${MEMO_PATH} not found.`);
    console.error('Run the Phase 2 spike and commit the feasibility memo before proceeding.');
    process.exitCode = 1;
    return;
  }

  const verdict = await parseVerdict(content);

  if (!verdict) {
    console.error(`ERROR: Could not parse verdict from ${MEMO_PATH}.`);
    console.error('Expected a fenced code block under "## Verdict" containing one of:');
    console.error('  proceed | proceed-with-fallback | escalate');
    process.exitCode = 1;
    return;
  }

  if (verdict === 'escalate') {
    console.error('');
    console.error('STOP: Excel feasibility verdict is "escalate".');
    console.error('');
    console.error('≥3 features are broken OR the data-validation feature is broken.');
    console.error('Phase 3 is blocked. Re-plan before continuing:');
    console.error('  1. Read docs/excel-feasibility.md — see the remediation plan section.');
    console.error('  2. Decide: adopt xlsx-populate fallback, Python sidecar, or scope-cut.');
    console.error('  3. Update the plan and re-decompose Phase 3 tasks.');
    console.error('');
    process.exitCode = 1;
    return;
  }

  if (verdict === 'proceed-with-fallback') {
    console.log('WARN: verdict is "proceed-with-fallback".');
    console.log('1-2 features require xlsx-populate for those sheets.');
    console.log('Check docs/excel-feasibility.md for the per-feature fallback assignments.');
    console.log('Phase 3 may proceed — but wire the fallback library before Phase 9.');
    console.log('');
    console.log('OK: Excel verdict check passed.');
    return;
  }

  // proceed
  console.log('OK: Excel verdict is "proceed". All 6 features confirmed in exceljs.');
  console.log('Phase 3 may proceed.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
