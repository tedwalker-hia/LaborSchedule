/**
 * End-to-end: upload → preview → commit import flow.
 *
 * Runs against a live stack (docker compose up or local dev server).
 * Set these env vars to target a specific environment:
 *
 *   E2E_EMAIL       - login email        (default: admin@example.com)
 *   E2E_PASSWORD    - login password     (default: password)
 *   E2E_TENANT      - tenant slug        (default: E2ETENANT)
 *   E2E_HOTEL       - hotel name         (default: E2E Test Hotel)
 *   E2E_COMPANY_ID  - usrSystemCompanyId (default: E2ETESTCO)
 *   E2E_BRANCH_ID   - branchId           (default: 1)
 *
 * The test user must have SuperAdmin role so RBAC passes for the mocked
 * hotel name without needing hotel-specific DB fixtures.
 *
 * Tenant and hotel listing APIs are mocked so the FilterBar populates
 * without a seeded schedule DB.  Import preview/commit routes are real.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { makeScheduleWorkbook, TEST_EMPLOYEE_CODE } from './fixtures/make-workbook';

const EMAIL = process.env.E2E_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'password';
const TENANT = process.env.E2E_TENANT ?? 'E2ETENANT';
const HOTEL = process.env.E2E_HOTEL ?? 'E2E Test Hotel';
const COMPANY_ID = process.env.E2E_COMPANY_ID ?? 'E2ETESTCO';
const BRANCH_ID = Number(process.env.E2E_BRANCH_ID ?? '1');

let fixtureDirPath: string;
let fixturePath: string;
let fixtureDate: string;

test.beforeAll(async () => {
  const fixture = await makeScheduleWorkbook();
  fixturePath = fixture.filePath;
  fixtureDirPath = fixture.dirPath;
  fixtureDate = fixture.dateStr;
});

test.afterAll(() => {
  fs.rmSync(fixtureDirPath, { recursive: true, force: true });
});

test('upload → preview → commit', async ({ page }) => {
  // --- Route mocks -----------------------------------------------------------

  // Tenant listing: return our single test tenant.
  await page.route('**/api/tenants', (route) => route.fulfill({ json: [TENANT] }));

  // Hotel listing for the test tenant.
  await page.route(`**/api/hotels/${TENANT}`, (route) =>
    route.fulfill({
      json: [{ hotelName: HOTEL, branchId: BRANCH_ID, usrSystemCompanyId: COMPANY_ID }],
    }),
  );

  // Schedule grid GET: return empty so the grid never 500s on the test DB.
  // Only intercept GET; let POST (import commit) pass through to real handler.
  await page.route(
    (url) => url.pathname === '/api/schedule',
    (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            dates: [],
            employees: [],
            schedule: {},
            allDepts: [],
            allPositions: [],
            positionsByDept: {},
          },
        });
      }
      return route.continue();
    },
  );

  // --- Login -----------------------------------------------------------------

  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/schedule');

  // --- Select tenant + hotel so ImportModal gets a valid hotelInfo -----------

  await page.getByLabel('Tenant').selectOption(TENANT);
  await page.getByLabel('Hotel').selectOption(HOTEL);

  // --- Open import modal (step 1/4) -----------------------------------------

  await page.getByTitle('Import').click();
  await expect(page.getByRole('heading', { name: /Import Schedule \(Step 1/ })).toBeVisible();

  // --- Step 1: upload fixture file ------------------------------------------

  await page.locator('input[type="file"][accept=".xlsx"]').setInputFiles(fixturePath);
  await expect(page.getByText(/Selected:.*\.xlsx/)).toBeVisible();

  // --- Click Preview → calls /api/schedule/import/preview ------------------

  await page.getByRole('button', { name: 'Preview' }).click();

  // --- Step 2: verify preview data returned ---------------------------------

  await expect(page.getByRole('heading', { name: /Import Schedule \(Step 2/ })).toBeVisible({
    timeout: 10_000,
  });

  const previewGrid = page.locator('.grid.grid-cols-2').first();
  await expect(previewGrid).toContainText('Total rows:');
  await expect(previewGrid).toContainText('New records:');

  // --- Click Next → step 3 (import options) ---------------------------------

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: /Import Schedule \(Step 3/ })).toBeVisible();

  // --- Click Import → calls /api/schedule/import (commit) ------------------

  await page.getByRole('button', { name: 'Import' }).click();

  // --- Verify success toast --------------------------------------------------

  await expect(page.getByText(/Import completed/i)).toBeVisible({ timeout: 15_000 });

  // --- Verify row committed to DB -------------------------------------------
  // page.request bypasses page.route() mocks and shares the auth cookie.
  const resp = await page.request.get(
    `/api/schedule?hotel=${encodeURIComponent(HOTEL)}&usrSystemCompanyId=${COMPANY_ID}` +
      `&startDate=${fixtureDate}&endDate=${fixtureDate}`,
  );
  expect(resp.ok()).toBeTruthy();
  const data = (await resp.json()) as { employees: { code: string }[] };
  expect(
    data.employees.some((e) => e.code === TEST_EMPLOYEE_CODE),
    `Expected employee ${TEST_EMPLOYEE_CODE} in DB after import`,
  ).toBe(true);
});
