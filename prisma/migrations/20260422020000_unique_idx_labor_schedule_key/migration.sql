BEGIN TRY

BEGIN TRAN;

-- CreateIndex
-- Filtered index (WHERE [PositionName] IS NOT NULL) because PositionName is nullable.
-- MSSQL treats NULLs as equal in unique indexes, so a plain unique index would
-- allow only one NULL per key group. The filtered form excludes NULL rows entirely,
-- matching the intended uniqueness constraint for real schedule entries.
CREATE UNIQUE NONCLUSTERED INDEX [UQ_HIALaborSchedules_ScheduleKey] ON [dbo].[HIALaborSchedules]([UsrSystemCompanyID] ASC, [EmployeeCode] ASC, [ScheduleDate] ASC, [PositionName] ASC) WHERE [PositionName] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
