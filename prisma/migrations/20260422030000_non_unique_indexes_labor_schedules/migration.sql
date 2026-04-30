BEGIN TRY

BEGIN TRAN;

-- CreateIndex: (HotelName, ScheduleDate) — schedule-grid filter
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_HotelSchedule] ON [dbo].[HIALaborSchedules]([HotelName] ASC, [ScheduleDate] ASC);

-- CreateIndex: UsrSystemCompanyID — tenant-scoped queries
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_UsrSystemCompanyID] ON [dbo].[HIALaborSchedules]([UsrSystemCompanyID] ASC);

-- CreateIndex: (Tenant, HotelName, DeptName) — RBAC scope checks
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_TenantHotelDept] ON [dbo].[HIALaborSchedules]([Tenant] ASC, [HotelName] ASC, [DeptName] ASC);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
