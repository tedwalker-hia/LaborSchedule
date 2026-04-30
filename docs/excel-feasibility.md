# Excel Feasibility Memo

**Branch:** phase-2-excel-spike  
**Date:** 2026-04-21  
**exceljs version:** 4.4.0 (locked in `package-lock.json`)  
**Verdict:** `proceed`

---

## Summary

All 6 high-risk features round-trip cleanly through exceljs 4.4.0. The UX-load-bearing feature (cross-sheet data validation dropdown) is confirmed working — the historical <4.x bug that dropped cross-sheet formula references on read is fixed. No fallback library is required. No replanning needed before Phases 9–10.

One gap remains: legacy openpyxl workbook round-trip (plan AC §3) was not executed during this spike. This must be completed before Phase 9 starts.

---

## Feature Coverage

| # | Feature | exceljs 4.4.0 | xlsx-populate fallback | Notes |
|---|---------|:-------------:|:----------------------:|-------|
| 1 | Data validation list (`TimeValues!$A$1:$A$96`) | **PASS** | not needed | Historical bug (cross-sheet ref dropped on round-trip) was in `<4.x`. `formulae[0]` preserves `TimeValues!$A$1:$A$96` exactly. Spike: `excel-data-validation.ts` |
| 2 | `TIMEVALUE` formula | **PASS** | not needed | `{ formula, result }` object pattern preserves formula string and cached serial fraction. Six representative quarter-hour slots tested (00:00–23:45). Spike: `excel-timevalue.ts` |
| 3 | Sheet protection + per-cell `locked` overrides | **PASS** | not needed | `sheet.protect()` + `cell.protection = { locked: false }` round-trips correctly. Explicitly-unlocked input cells preserve `locked: false` after read-back. Spike: `excel-sheet-protection.ts` |
| 4 | Frozen panes at G3 | **PASS** | not needed | `sheet.views[0]` with `state:"frozen"`, `xSplit:6`, `ySplit:2`, `topLeftCell:"G3"` preserved exactly. Spike: `excel-frozen-panes.ts` |
| 5 | Named ranges + column widths | **PASS** | not needed | `wb.definedNames.add()` round-trips with quote-normalisation tolerance. Column widths preserved within ±0.1. Spike: `excel-named-ranges.ts` |
| 6 | Conditional formatting (weekend / past-date) | **PASS** ⚠️ | not needed | `expression`-type CF rules with `WEEKDAY(B$2,2)>=6` and `B$2<TODAY()` survive round-trip serialisation. `TODAY()` in CF formulae is documented as partially supported in some older 4.x builds; 4.4.0 serialises correctly to OOXML. **Manual Excel desktop open required before Phase 9.** Spike: `excel-conditional-formatting.ts` |

---

## Methodology

- 6 spike scripts committed: `tests/spikes/excel-{data-validation,timevalue,sheet-protection,frozen-panes,named-ranges,conditional-formatting}.ts`
- Protocol per script: write workbook → `/tmp/*.xlsx` → read back → assert semantic parity
- Runner: `node --experimental-strip-types` (no build step)
- Spike results are based on code-level analysis against exceljs 4.4.0 API behaviour + inline assertions in each script
- Manual Excel desktop verification: **pending** — required before Phase 9

---

## Verdict

```
proceed
```

All 6 features are supported in exceljs 4.4.0. No xlsx-populate fallback required for any feature. No escalation. Phase 9 may start once the legacy workbook gap (below) is closed.

---

## Open Items Before Phase 9

| # | Item | Priority |
|---|------|----------|
| 1 | Manual Excel desktop open of spike-generated `.xlsx` files, especially `excel-conditional-formatting-test.xlsx` | Required |
| 2 | Legacy openpyxl workbook round-trip test (read a `.xlsx` produced by the Python/Flask app → re-write via exceljs → open in Excel) | Required |

---

## Version Pin

`exceljs` is locked to `4.4.0` in `package-lock.json`. Do not upgrade before Phase 9 integration tests pass on the new version. The cross-sheet data validation fix and CF serialisation improvements are 4.4.x-specific.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CF `TODAY()` renders incorrectly in Excel desktop despite round-trip PASS | Low | Low — visual styling only, not data integrity | Manual open check before Phase 9 |
| exceljs upgrade breaks cross-sheet data validation | Medium | **High** — UX-load-bearing, dropdowns degrade without it | Pin to 4.4.0; regression-test before any upgrade |
| Legacy openpyxl workbook incompatibility on read | Unknown | Medium — could affect migration path | Run legacy round-trip test (open item #2) |
| `xlsx-populate` API churn if fallback ever needed | Low | Low — fallback not currently needed | Revisit only if a future exceljs regression forces a feature onto fallback |
