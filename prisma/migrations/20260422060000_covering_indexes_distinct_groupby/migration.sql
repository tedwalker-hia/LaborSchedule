BEGIN TRY

BEGIN TRAN;

-- Covering index for dept distinct queries
-- Serves: /api/departments, org-repo.findDepts, schedules-repo.findDistinctDepts
-- Pattern: WHERE (UsrSystemCompanyID = @p AND HotelName = @p AND DeptName != '')
--          SELECT DISTINCT DeptName
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_CompanyHotelDept]
  ON [dbo].[HIALaborSchedules] ([UsrSystemCompanyID] ASC, [HotelName] ASC, [DeptName] ASC);

-- Covering index for position distinct/groupBy queries
-- Serves: /api/positions, org-repo.findPositions, schedules-repo.findDistinctPositions, findPositionsByDept
-- Pattern: WHERE (UsrSystemCompanyID = @p AND HotelName = @p AND [DeptName = @p] AND PositionName != '')
--          SELECT DISTINCT PositionName  /  GROUP BY DeptName, PositionName
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_CompanyHotelDeptPosition]
  ON [dbo].[HIALaborSchedules] ([UsrSystemCompanyID] ASC, [HotelName] ASC, [DeptName] ASC, [PositionName] ASC);

-- Covering index for employee roster groupBy
-- Serves: schedules-repo.findRosterEmployees
-- Pattern: WHERE (UsrSystemCompanyID = @p AND HotelName = @p)
--          GROUP BY EmployeeCode, FirstName, LastName
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_CompanyHotelEmployee]
  ON [dbo].[HIALaborSchedules] ([UsrSystemCompanyID] ASC, [HotelName] ASC, [EmployeeCode] ASC, [FirstName] ASC, [LastName] ASC);

-- Covering index for current-employee groupBy (refresh/preview)
-- Serves: schedules-repo.findCurrentEmployees
-- Pattern: WHERE UsrSystemCompanyID = @p
--          GROUP BY EmployeeCode, FirstName, LastName, DeptName, PositionName
-- INCLUDE used because Prisma schema.prisma cannot express INCLUDE indexes;
-- SQL is authoritative for this index.
CREATE NONCLUSTERED INDEX [IX_HIALaborSchedules_CompanyEmployee]
  ON [dbo].[HIALaborSchedules] ([UsrSystemCompanyID] ASC, [EmployeeCode] ASC)
  INCLUDE ([FirstName], [LastName], [DeptName], [PositionName]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
