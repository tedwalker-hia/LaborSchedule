# Excel Fixture Workbooks

20 synthetic schedule workbooks for the Phase 11 import-parity harness.

All workbooks follow the parser format defined in `lib/excel/parser.ts`:
- Row 1: `Name | Code | Dept | Position | Total | [DateHdr every 3 cols]`
- Row 2: sub-headers `In | Out | Hrs` per date group
- Row 3+: employee rows
- Times use `H:MM AM/PM` format (e.g. `8:00 AM`, `4:00 PM`)

## Generate

```bash
npm run fixtures:generate
```

Generates all 20 xlsx files into this directory. Safe to re-run; overwrites existing files.

---

## Workbook Index

| # | File | Hotel | Tenant | Week | Days | Employees | Notable |
|---|------|-------|--------|------|------|-----------|---------|
| 01 | wb-2026-w02-alpha-fnb.xlsx | Alpha Hotel | ALPHA-CORP | Jan 6–12, 2026 | 7 | 8 | Standard F&B, weekday/weekend mix |
| 02 | wb-2026-w03-alpha-fnb.xlsx | Alpha Hotel | ALPHA-CORP | Jan 13–19, 2026 | 7 | 8 | Weekend peak — rotational days off |
| 03 | wb-2026-w04-beta-frontdesk.xlsx | Beta Hotel | BETA-CORP | Jan 20–26, 2026 | 7 | 6 | Front Desk + Night Audit shift |
| 04 | wb-2026-w05-beta-frontdesk.xlsx | Beta Hotel | BETA-CORP | Jan 27–Feb 2, 2026 | 7 | 6 | Month boundary (Jan→Feb), overnight shift |
| 05 | wb-2026-w06-gamma-multi.xlsx | Gamma Resort | GAMMA-RESORTS | Feb 3–9, 2026 | 7 | 10 | Multi-dept: F&B + Housekeeping + Maintenance |
| 06 | wb-2026-w07-alpha-overnight.xlsx | Alpha Hotel | ALPHA-CORP | Feb 10–16, 2026 | 7 | 5 | Overnight shifts (10 PM – 6 AM) |
| 07 | wb-2026-w08-alpha-fnb.xlsx | Alpha Hotel | ALPHA-CORP | Feb 17–23, 2026 | 7 | 8 | Presidents Day week, brunch shift |
| 08 | wb-2026-w09-beta-housekeeping.xlsx | Beta Hotel | BETA-CORP | Feb 24–Mar 2, 2026 | 7 | 7 | Sparse schedule (Mon/Wed/Fri pattern) |
| 09 | wb-2026-w10-gamma-large.xlsx | Gamma Resort | GAMMA-RESORTS | Mar 3–9, 2026 | 7 | 12 | Large 12-employee roster, all depts |
| 10 | wb-2026-w11-alpha-parttime.xlsx | Alpha Hotel | ALPHA-CORP | Mar 10–16, 2026 | 7 | 4 | Part-time only (4-hr shifts, 9 AM – 1 PM) |
| 11 | wb-2026-w12-beta-morning.xlsx | Beta Hotel | BETA-CORP | Mar 17–23, 2026 | 7 | 6 | Morning shifts only (6 AM – 2 PM) |
| 12 | wb-2026-w13-gamma-evening.xlsx | Gamma Resort | GAMMA-RESORTS | Mar 24–30, 2026 | 7 | 9 | Evening shifts only (2 PM – 10 PM) |
| 13 | wb-2026-w14-alpha-multipos.xlsx | Alpha Hotel | ALPHA-CORP | Mar 31–Apr 6, 2026 | 7 | 7 | Multi-position: same employee in 2 rows with diff positions |
| 14 | wb-2026-w15-delta-dense.xlsx | Delta Inn | DELTA-HOSPITALITY | Apr 7–13, 2026 | 7 | 15 | Dense: 15 employees, all depts |
| 15 | wb-2026-w16-delta-lean.xlsx | Delta Inn | DELTA-HOSPITALITY | Apr 14–20, 2026 | 5 | 3 | Lean: 3 employees, Mon–Fri only |
| 16 | wb-2025-w48-alpha-thanksgiving.xlsx | Alpha Hotel | ALPHA-CORP | Nov 24–30, 2025 | 7 | 8 | Thanksgiving week — all-week long shifts |
| 17 | wb-2025-w49-beta-frontdesk.xlsx | Beta Hotel | BETA-CORP | Dec 1–7, 2025 | 7 | 6 | December historical, overnight shift |
| 18 | wb-2025-w50-gamma-multi.xlsx | Gamma Resort | GAMMA-RESORTS | Dec 8–14, 2025 | 7 | 10 | December multi-dept, sparse pattern |
| 19 | wb-2025-w52-delta-holiday.xlsx | Delta Inn | DELTA-HOSPITALITY | Dec 22–28, 2025 | 7 | 12 | Holiday dense week — all-week staffing |
| 20 | wb-2025-w53-alpha-yearboundary.xlsx | Alpha Hotel | ALPHA-CORP | Dec 29, 2025–Jan 4, 2026 | 7 | 5 | Year boundary + overnight shift |

---

## Workbook Details

### WB01 — wb-2026-w02-alpha-fnb.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Jan 6–12, 2026 (7 days)
- **Employees**: 8 (ALPHA-001 to ALPHA-008)
- **Depts**: F&B (Server, Bartender, Host, Busser), Housekeeping, Maintenance
- **Notable**: Baseline standard week; weekdays standard (8 AM–4 PM), one 6-day rotation, morning shifts in housekeeping

### WB02 — wb-2026-w03-alpha-fnb.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Jan 13–19, 2026 (7 days)
- **Employees**: 8
- **Notable**: Rotational days off (one employee off Mon, another off Mon–Tue); evening shift all-week for server; stresses weekend-peak scheduling patterns

### WB03 — wb-2026-w04-beta-frontdesk.xlsx
- **Hotel**: Beta Hotel | **Tenant**: BETA-CORP
- **Week**: Jan 20–26, 2026 (7 days)
- **Employees**: 6 (BETA-001 to BETA-006)
- **Depts**: Front Desk (Agent, Supervisor, Night Audit), Concierge, Housekeeping
- **Notable**: Night Audit employee (BETA-005) works `11:00 PM – 7:00 AM` all 7 days; front desk 24/7 coverage pattern

### WB04 — wb-2026-w05-beta-frontdesk.xlsx
- **Hotel**: Beta Hotel | **Tenant**: BETA-CORP
- **Week**: Jan 27–Feb 2, 2026 (7 days)
- **Notable**: Crosses January/February month boundary; overnight shift (10 PM–6 AM); stresses date parsing across month rollover

### WB05 — wb-2026-w06-gamma-multi.xlsx
- **Hotel**: Gamma Resort | **Tenant**: GAMMA-RESORTS
- **Week**: Feb 3–9, 2026 (7 days)
- **Employees**: 10 (GAMMA-001 to GAMMA-010)
- **Depts**: F&B, Housekeeping, Maintenance
- **Notable**: Multi-department workbook; evening shift for F&B server (Lewis, Daniel) all week; tests multi-dept isolation in import

### WB06 — wb-2026-w07-alpha-overnight.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Feb 10–16, 2026 (7 days)
- **Employees**: 5
- **Notable**: Host employee works overnight (10 PM–6 AM) all 7 days; tests `calcHours` wrap-around (diff < 0 → +1440 minutes)

### WB07 — wb-2026-w08-alpha-fnb.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Feb 17–23, 2026 (7 days)
- **Employees**: 8
- **Notable**: Presidents Day week (Feb 16 prior); brunch shift (10 AM–4 PM, 6 hrs) for one employee; tests 6-hour shift duration

### WB08 — wb-2026-w09-beta-housekeeping.xlsx
- **Hotel**: Beta Hotel | **Tenant**: BETA-CORP
- **Week**: Feb 24–Mar 2, 2026 (7 days)
- **Employees**: 7
- **Notable**: Sparse schedule — one employee works only Mon/Wed/Fri; another works Wed–Sun; stresses null-shift handling and record count

### WB09 — wb-2026-w10-gamma-large.xlsx
- **Hotel**: Gamma Resort | **Tenant**: GAMMA-RESORTS
- **Week**: Mar 3–9, 2026 (7 days)
- **Employees**: 12 (GAMMA-001 to GAMMA-012)
- **Notable**: Largest roster in the suite; Bartender (Hall, Sarah) works weekend only; evening and morning shift mix across depts

### WB10 — wb-2026-w11-alpha-parttime.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Mar 10–16, 2026 (7 days)
- **Employees**: 4 part-time (ALPHA-PT1 to ALPHA-PT4)
- **Notable**: All employees work 4-hour shifts (9 AM–1 PM); one weekend-only; stresses low-hour calculation

### WB11 — wb-2026-w12-beta-morning.xlsx
- **Hotel**: Beta Hotel | **Tenant**: BETA-CORP
- **Week**: Mar 17–23, 2026 (7 days)
- **Employees**: 6
- **Notable**: All shifts 6 AM–2 PM; Night Audit employee works `11 PM–7 AM`; tests early clock-in parsing

### WB12 — wb-2026-w13-gamma-evening.xlsx
- **Hotel**: Gamma Resort | **Tenant**: GAMMA-RESORTS
- **Week**: Mar 24–30, 2026 (7 days)
- **Employees**: 9
- **Notable**: All F&B employees on evening shift (2 PM–10 PM); Housekeeping on morning; pure single-shift-type F&B dept

### WB13 — wb-2026-w14-alpha-multipos.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Mar 31–Apr 6, 2026 (7 days)
- **Employees**: 7 rows (2 employees appear twice with different positions)
- **Notable**: ALPHA-001 (Smith, John) appears as both Server (Mon–Wed) and Bartender (Thu–Sat); ALPHA-006 (Garcia, Linda) as Room Attendant + Engineer; tests multi-position keying `(employeeCode|date|positionName)`

### WB14 — wb-2026-w15-delta-dense.xlsx
- **Hotel**: Delta Inn | **Tenant**: DELTA-HOSPITALITY
- **Week**: Apr 7–13, 2026 (7 days)
- **Employees**: 15 (DELTA-001 to DELTA-015)
- **Depts**: F&B, Front Desk, Housekeeping, Maintenance
- **Notable**: Largest property in suite; Night Audit (Carter, Amy) all week; Bartender weekend-only; tests high-volume commit

### WB15 — wb-2026-w16-delta-lean.xlsx
- **Hotel**: Delta Inn | **Tenant**: DELTA-HOSPITALITY
- **Week**: Apr 14–20, 2026 (Mon–Fri, 5 days)
- **Employees**: 3
- **Notable**: Fewest columns (5-day week); one supervisor works Mon/Wed/Fri only; tests partial-week date range

### WB16 — wb-2025-w48-alpha-thanksgiving.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Nov 24–30, 2025 (Thanksgiving week)
- **Employees**: 8
- **Notable**: Historical workbook ~150 days before current date; long shifts (7 AM–7 PM, 12 hrs) for Server; all-week staffing peak

### WB17 — wb-2025-w49-beta-frontdesk.xlsx
- **Hotel**: Beta Hotel | **Tenant**: BETA-CORP
- **Week**: Dec 1–7, 2025
- **Employees**: 6
- **Notable**: December historical; overnight shift (10 PM–6 AM); tests historical date resolution

### WB18 — wb-2025-w50-gamma-multi.xlsx
- **Hotel**: Gamma Resort | **Tenant**: GAMMA-RESORTS
- **Week**: Dec 8–14, 2025
- **Employees**: 10
- **Notable**: December multi-dept historical; sparse pattern (Mon/Wed/Fri only for one employee); weekend-only bartender

### WB19 — wb-2025-w52-delta-holiday.xlsx
- **Hotel**: Delta Inn | **Tenant**: DELTA-HOSPITALITY
- **Week**: Dec 22–28, 2025
- **Employees**: 12
- **Notable**: Holiday peak — all 12 employees work all 7 days; Night Audit all week; tests maximum record density (~84 records per commit)

### WB20 — wb-2025-w53-alpha-yearboundary.xlsx
- **Hotel**: Alpha Hotel | **Tenant**: ALPHA-CORP
- **Week**: Dec 29, 2025–Jan 4, 2026
- **Employees**: 5
- **Notable**: Crosses Dec→Jan year boundary; overnight shift all week; tests that `parseDateHeader` resolves Dec 29–31 to 2025 and Jan 1–4 to 2026 correctly within 6-month window

---

## Date Resolution Notes

`parseDateHeader` in `lib/excel/parser.ts` resolves month+day to the closest year relative to `new Date()`.
All fixtures use dates within ±6 months of the date range Nov 2025–Apr 2026, which remain correctly resolved for test runs throughout 2026.
If running this harness in late 2026 or beyond, regenerate fixtures with updated dates.

## Employee Codes

| Code | Name | Hotel |
|------|------|-------|
| ALPHA-001 | Smith, John | Alpha Hotel |
| ALPHA-002 | Johnson, Mary | Alpha Hotel |
| ALPHA-003 | Williams, Robert | Alpha Hotel |
| ALPHA-004 | Brown, Patricia | Alpha Hotel |
| ALPHA-005 | Jones, Michael | Alpha Hotel |
| ALPHA-006 | Garcia, Linda | Alpha Hotel |
| ALPHA-007 | Martinez, David | Alpha Hotel |
| ALPHA-008 | Rodriguez, Barbara | Alpha Hotel |
| ALPHA-PT1 | Evans, Carol | Alpha Hotel (PT) |
| ALPHA-PT2 | Turner, James | Alpha Hotel (PT) |
| ALPHA-PT3 | Phillips, Lisa | Alpha Hotel (PT) |
| ALPHA-PT4 | Campbell, Mark | Alpha Hotel (PT) |
| BETA-001 | Wilson, Richard | Beta Hotel |
| BETA-002 | Anderson, Maria | Beta Hotel |
| BETA-003 | Taylor, Charles | Beta Hotel |
| BETA-004 | Thomas, Susan | Beta Hotel |
| BETA-005 | Jackson, Joseph | Beta Hotel |
| BETA-006 | White, Karen | Beta Hotel |
| BETA-007 | Harris, Thomas | Beta Hotel |
| BETA-008 | Martin, Sandra | Beta Hotel |
| GAMMA-001 | Thompson, Kevin | Gamma Resort |
| GAMMA-002 | Garcia, Nancy | Gamma Resort |
| GAMMA-003 | Martinez, Brian | Gamma Resort |
| GAMMA-004 | Robinson, Dorothy | Gamma Resort |
| GAMMA-005 | Clark, Edward | Gamma Resort |
| GAMMA-006 | Rodriguez, Ashley | Gamma Resort |
| GAMMA-007 | Lewis, Daniel | Gamma Resort |
| GAMMA-008 | Lee, Jessica | Gamma Resort |
| GAMMA-009 | Walker, Ryan | Gamma Resort |
| GAMMA-010 | Hall, Sarah | Gamma Resort |
| GAMMA-011 | Allen, James | Gamma Resort |
| GAMMA-012 | Young, Emily | Gamma Resort |
| DELTA-001 | Hernandez, Christopher | Delta Inn |
| DELTA-002 | King, Amanda | Delta Inn |
| DELTA-003 | Wright, Matthew | Delta Inn |
| DELTA-004 | Lopez, Stephanie | Delta Inn |
| DELTA-005 | Hill, Anthony | Delta Inn |
| DELTA-006 | Scott, Dorothy | Delta Inn |
| DELTA-007 | Green, Mark | Delta Inn |
| DELTA-008 | Adams, Rebecca | Delta Inn |
| DELTA-009 | Baker, Donald | Delta Inn |
| DELTA-010 | Gonzalez, Sharon | Delta Inn |
| DELTA-011 | Nelson, Joshua | Delta Inn |
| DELTA-012 | Carter, Amy | Delta Inn |
| DELTA-013 | Mitchell, Kenneth | Delta Inn |
| DELTA-014 | Perez, Anna | Delta Inn |
| DELTA-015 | Roberts, Scott | Delta Inn |
