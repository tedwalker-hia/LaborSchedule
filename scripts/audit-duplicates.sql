-- Audit HIALaborSchedules for duplicate rows on candidate unique key:
--   (UsrSystemCompanyID, EmployeeCode, ScheduleDate, PositionName)
--
-- PositionName is nullable. MSSQL GROUP BY treats NULLs as equal,
-- so NULL/NULL pairs are correctly detected as duplicates here.
--
-- Run against production in read-only mode before applying any unique index.
-- Paste the output into prisma/migrations/README.md under "Audit Results".

-- ── 1. Total row count ───────────────────────────────────────────────────────
SELECT COUNT(*) AS TotalRows
FROM HIALaborSchedules;

-- ── 2. Duplicate groups (candidate key has more than one row) ────────────────
SELECT
    UsrSystemCompanyID,
    EmployeeCode,
    CONVERT(VARCHAR(10), ScheduleDate, 120) AS ScheduleDate,
    ISNULL(PositionName, '(null)')          AS PositionName,
    COUNT(*)                                AS DupeCount,
    MIN(Id)                                 AS OldestId,
    MAX(Id)                                 AS LatestId
FROM HIALaborSchedules
GROUP BY
    UsrSystemCompanyID,
    EmployeeCode,
    ScheduleDate,
    PositionName
HAVING COUNT(*) > 1
ORDER BY DupeCount DESC, UsrSystemCompanyID, EmployeeCode, ScheduleDate;

-- ── 3. Duplicate rate ────────────────────────────────────────────────────────
-- ExcessRows  = rows that would be deleted by dedupe
-- DupeRate    = ExcessRows / TotalRows  (threshold: escalate if >= 0.01)
WITH DupeGroups AS (
    SELECT COUNT(*) AS DupeCount
    FROM HIALaborSchedules
    GROUP BY UsrSystemCompanyID, EmployeeCode, ScheduleDate, PositionName
    HAVING COUNT(*) > 1
),
Summary AS (
    SELECT
        ISNULL(SUM(DupeCount - 1), 0)             AS ExcessRows,
        (SELECT COUNT(*) FROM HIALaborSchedules)   AS TotalRows
    FROM DupeGroups
)
SELECT
    ExcessRows,
    TotalRows,
    CASE
        WHEN TotalRows = 0 THEN NULL
        ELSE CAST(ExcessRows AS FLOAT) / TotalRows
    END                                            AS DupeRate,
    CASE
        WHEN TotalRows = 0 THEN 'NO DATA'
        WHEN CAST(ExcessRows AS FLOAT) / TotalRows < 0.01 THEN 'BELOW THRESHOLD — proceed with dedupe'
        ELSE 'AT OR ABOVE THRESHOLD — escalate, drop unique-index task from scope'
    END                                            AS Recommendation
FROM Summary;
