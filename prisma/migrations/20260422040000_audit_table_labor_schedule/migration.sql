BEGIN TRY

BEGIN TRAN;

-- CreateTable: HIALaborScheduleAudit — append-only audit log for schedule row changes (Phase 8 writes)
CREATE TABLE [dbo].[HIALaborScheduleAudit] (
    [AuditID]         INT            NOT NULL IDENTITY(1,1),
    [ScheduleID]      INT            NOT NULL,
    [ChangedByUserID] INT            NULL,
    [ChangedAt]       DATETIME2      NOT NULL CONSTRAINT [DF_HIALaborScheduleAudit_ChangedAt] DEFAULT GETUTCDATE(),
    [Action]          NVARCHAR(20)   NOT NULL,
    [OldJson]         NVARCHAR(MAX)  NULL,
    [NewJson]         NVARCHAR(MAX)  NULL,
    CONSTRAINT [PK_HIALaborScheduleAudit] PRIMARY KEY CLUSTERED ([AuditID] ASC)
);

-- AddForeignKey: ScheduleID → HIALaborSchedules.Id (NoAction — preserve audit records when schedule deleted)
ALTER TABLE [dbo].[HIALaborScheduleAudit] ADD CONSTRAINT [FK_HIALaborScheduleAudit_ScheduleID]
    FOREIGN KEY ([ScheduleID]) REFERENCES [dbo].[HIALaborSchedules]([Id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: ChangedByUserID → HIALaborSchedulesUsers.UserID (SetNull — preserve audit records when user deleted)
ALTER TABLE [dbo].[HIALaborScheduleAudit] ADD CONSTRAINT [FK_HIALaborScheduleAudit_ChangedByUserID]
    FOREIGN KEY ([ChangedByUserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID])
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
