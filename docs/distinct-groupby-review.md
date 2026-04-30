# distinct / groupBy Review — HIALaborSchedules

Phase 4 task 69. Reviewed all `distinct` and `groupBy` calls against `HIALaborSchedules`.

## Inventory

| Site | Pattern | Columns selected | Filter columns | Verdict |
|---|---|---|---|---|
| `schedules-repo.findCurrentEmployees` | `distinct: ['employeeCode']` | employeeCode, firstName, lastName, deptName, positionName | usrSystemCompanyId | **Fixed** — wide-row distinct |
| `schedules-repo.findRosterEmployees` | `groupBy` | employeeCode, firstName, lastName | usrSystemCompanyId, hotelName | OK — proper aggregation |
| `schedules-repo.findPositionsByDept` | `groupBy` | deptName, positionName | usrSystemCompanyId, hotelName | OK — proper aggregation |
| `schedules-repo.findDistinctDepts` | `distinct: ['deptName']` | deptName only | usrSystemCompanyId, hotelName | OK — narrow single-column; **unused** (no callers) |
| `schedules-repo.findDistinctPositions` | `distinct: ['positionName']` | positionName only | usrSystemCompanyId, hotelName | OK — narrow single-column; **unused** (no callers) |
| `org-repo.findTenants` | `distinct: ['tenant']` | tenant only | tenant != '' | OK — narrow single-column |
| `org-repo.findHotelsByTenant` | `groupBy` | hotelName, branchId, usrSystemCompanyId | tenant | OK — proper aggregation |
| `org-repo.findDepts` | `distinct: ['deptName']` | deptName only | usrSystemCompanyId, hotelName | OK — narrow single-column |
| `org-repo.findPositions` | `distinct: ['positionName']` | positionName only | usrSystemCompanyId, hotelName [, deptName] | OK — narrow single-column |
| `/api/departments` (direct Prisma) | `distinct: ['deptName']` | deptName only | usrSystemCompanyId, hotelName | OK — narrow; will be routed through org-repo in a later task |
| `/api/positions` (direct Prisma) | `distinct: ['positionName']` | positionName only | usrSystemCompanyId, hotelName [, deptName] | OK — narrow; same |

## The Problem: Wide-Row Distinct

`findCurrentEmployees` was the only case of `distinct`-over-wide-rows:

```typescript
// Before — non-deterministic: SQL Server picks an arbitrary row per employeeCode
this.db.laborSchedule.findMany({
  where: { usrSystemCompanyId },
  distinct: ['employeeCode'],
  select: { employeeCode, firstName, lastName, deptName, positionName },
});
```

Prisma compiles this for SQL Server as a `ROW_NUMBER() OVER (PARTITION BY EmployeeCode)` subquery that
selects all five columns from the heap. Two problems:
1. Non-deterministic: which firstName/deptName/positionName is returned for a multi-row employee is undefined.
2. No covering index existed; required a full `UsrSystemCompanyID` scan returning all rows before deduplication.

## Fix Applied

**`schedules-repo.findCurrentEmployees`**: replaced `findMany + distinct` with `groupBy` on all five columns.

```typescript
// After — deterministic; SQL Server emits GROUP BY over all five columns
this.db.laborSchedule.groupBy({
  by: ['employeeCode', 'firstName', 'lastName', 'deptName', 'positionName'],
  where: { usrSystemCompanyId },
});
```

An employee with multiple placements (different deptName/positionName combinations) now returns one row
per unique placement rather than one arbitrary row. The `previewRefresh` call site in `schedule-service`
was updated to deduplicate `removedEmployees` by `employeeCode` so the UI still shows each removed
employee once.

## Indexes Added (migration 20260422060000)

All narrow single-column `distinct` queries were fine in isolation but lacked covering indexes on their
filter columns, forcing wide scans. Four indexes added:

| Index | Columns | Covers |
|---|---|---|
| `IX_HIALaborSchedules_CompanyHotelDept` | `(UsrSystemCompanyID, HotelName, DeptName)` | dept distinct queries |
| `IX_HIALaborSchedules_CompanyHotelDeptPosition` | `(UsrSystemCompanyID, HotelName, DeptName, PositionName)` | position distinct/groupBy queries |
| `IX_HIALaborSchedules_CompanyHotelEmployee` | `(UsrSystemCompanyID, HotelName, EmployeeCode, FirstName, LastName)` | `findRosterEmployees` groupBy |
| `IX_HIALaborSchedules_CompanyEmployee` | `(UsrSystemCompanyID, EmployeeCode)` INCLUDE `(FirstName, LastName, DeptName, PositionName)` | `findCurrentEmployees` groupBy |

`IX_HIALaborSchedules_CompanyEmployee` uses `INCLUDE` and is defined only in the migration SQL —
Prisma cannot express `INCLUDE` indexes. The other three are reflected in `schema.prisma` as `@@index`.

## Unused Repo Methods

`schedules-repo.findDistinctDepts` and `schedules-repo.findDistinctPositions` have no callers. They
duplicate functionality in `org-repo`. Left in place (narrow-select distinct is fine); they should be
removed or wired up when `/api/positions` and `/api/departments` are migrated to `OrgRepo` in a later task.
