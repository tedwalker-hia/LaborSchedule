BEGIN TRY

BEGIN TRAN;

-- Phase 8: ScheduleID must be nullable so ON DELETE SET NULL can preserve audit rows
-- after a schedule record is deleted (clear / delete operations).
--
-- Step 1: drop old FK (required before altering column nullability in SQL Server)
ALTER TABLE [dbo].[HIALaborScheduleAudit] DROP CONSTRAINT [FK_HIALaborScheduleAudit_ScheduleID];

-- Step 2: allow NULL
ALTER TABLE [dbo].[HIALaborScheduleAudit] ALTER COLUMN [ScheduleID] INT NULL;

-- Step 3: re-add FK with SET NULL so audit rows survive schedule deletion
ALTER TABLE [dbo].[HIALaborScheduleAudit] ADD CONSTRAINT [FK_HIALaborScheduleAudit_ScheduleID]
    FOREIGN KEY ([ScheduleID]) REFERENCES [dbo].[HIALaborSchedules]([Id])
    ON DELETE SET NULL ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
