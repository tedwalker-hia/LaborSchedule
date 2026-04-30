-- Dedupe HIALaborSchedules: delete older rows per candidate unique key.
-- Strategy: keep the row with the highest Id (latest insert) per group.
--
-- ONLY run this script if audit-duplicates.sql reports DupeRate < 0.01 (< 1%).
-- If DupeRate >= 0.01, escalate to data owner — do NOT run this script.
--
-- Apply in a maintenance window. Wrap in a transaction so you can verify
-- the DELETE count before committing.
--
-- PositionName is nullable. The join condition handles NULL/NULL pairs
-- explicitly via IS NULL check so they are treated as duplicates.

BEGIN TRANSACTION;

-- Show what will be deleted (run SELECT first, then replace with DELETE).
SELECT old.*
FROM HIALaborSchedules AS old
WHERE EXISTS (
    SELECT 1
    FROM HIALaborSchedules AS newer
    WHERE newer.UsrSystemCompanyID = old.UsrSystemCompanyID
      AND newer.EmployeeCode       = old.EmployeeCode
      AND newer.ScheduleDate       = old.ScheduleDate
      AND (
              newer.PositionName = old.PositionName
           OR (newer.PositionName IS NULL AND old.PositionName IS NULL)
          )
      AND newer.Id > old.Id
);

-- ── Verify row count matches ExcessRows from audit, then uncomment DELETE ────
-- DELETE old
-- FROM HIALaborSchedules AS old
-- WHERE EXISTS (
--     SELECT 1
--     FROM HIALaborSchedules AS newer
--     WHERE newer.UsrSystemCompanyID = old.UsrSystemCompanyID
--       AND newer.EmployeeCode       = old.EmployeeCode
--       AND newer.ScheduleDate       = old.ScheduleDate
--       AND (
--               newer.PositionName = old.PositionName
--            OR (newer.PositionName IS NULL AND old.PositionName IS NULL)
--           )
--       AND newer.Id > old.Id
-- );

-- ROLLBACK;   -- safety net; replace with COMMIT once DELETE count verified
ROLLBACK;
