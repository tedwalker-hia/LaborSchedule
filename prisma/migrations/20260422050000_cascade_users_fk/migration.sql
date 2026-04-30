BEGIN TRY

BEGIN TRAN;

-- Drop existing NO ACTION FK constraints on UserID in all three assignment tables
ALTER TABLE [dbo].[HIALaborSchedulesUserTenants] DROP CONSTRAINT [HIALaborSchedulesUserTenants_UserID_fkey];
ALTER TABLE [dbo].[HIALaborSchedulesUserHotels]  DROP CONSTRAINT [HIALaborSchedulesUserHotels_UserID_fkey];
ALTER TABLE [dbo].[HIALaborSchedulesUserDepts]   DROP CONSTRAINT [HIALaborSchedulesUserDepts_UserID_fkey];

-- Re-add with ON DELETE CASCADE so that deleting a HIALaborSchedulesUsers row
-- automatically removes all tenant/hotel/dept assignments for that user.
ALTER TABLE [dbo].[HIALaborSchedulesUserTenants] ADD CONSTRAINT [HIALaborSchedulesUserTenants_UserID_fkey]
    FOREIGN KEY ([UserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID])
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[HIALaborSchedulesUserHotels] ADD CONSTRAINT [HIALaborSchedulesUserHotels_UserID_fkey]
    FOREIGN KEY ([UserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID])
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[HIALaborSchedulesUserDepts] ADD CONSTRAINT [HIALaborSchedulesUserDepts_UserID_fkey]
    FOREIGN KEY ([UserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID])
    ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
