BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[HIALaborSchedules] (
    [Id] INT NOT NULL IDENTITY(1,1),
    [UsrSystemCompanyID] NVARCHAR(100) NOT NULL,
    [BranchID] INT,
    [HotelName] NVARCHAR(200),
    [EmployeeCode] NVARCHAR(50) NOT NULL,
    [FirstName] NVARCHAR(100),
    [LastName] NVARCHAR(100),
    [ScheduleDate] DATE NOT NULL,
    [ClockIn] NVARCHAR(20),
    [ClockOut] NVARCHAR(20),
    [Hours] DECIMAL(10,2),
    [Tenant] NVARCHAR(200),
    [DeptName] NVARCHAR(200),
    [MultiDept] BIT DEFAULT 0,
    [PositionName] NVARCHAR(200),
    [Locked] BIT DEFAULT 0,
    CONSTRAINT [PK_HIALaborSchedules] PRIMARY KEY CLUSTERED ([Id])
);

-- CreateTable
CREATE TABLE [dbo].[HIALaborSchedulesUsers] (
    [UserID] INT NOT NULL IDENTITY(1,1),
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(200) NOT NULL,
    [Role] NVARCHAR(50) NOT NULL,
    [PasswordHash] NVARCHAR(max),
    [MustChangePassword] BIT NOT NULL DEFAULT 1,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [UpdatedAt] DATETIME2,
    CONSTRAINT [PK_HIALaborSchedulesUsers] PRIMARY KEY CLUSTERED ([UserID])
);

-- CreateTable
CREATE TABLE [dbo].[HIALaborSchedulesUserTenants] (
    [UserTenantID] INT NOT NULL IDENTITY(1,1),
    [UserID] INT NOT NULL,
    [Tenant] NVARCHAR(200) NOT NULL,
    CONSTRAINT [PK_HIALaborSchedulesUserTenants] PRIMARY KEY CLUSTERED ([UserTenantID])
);

-- CreateTable
CREATE TABLE [dbo].[HIALaborSchedulesUserHotels] (
    [UserHotelID] INT NOT NULL IDENTITY(1,1),
    [UserID] INT NOT NULL,
    [Tenant] NVARCHAR(200) NOT NULL,
    [HotelName] NVARCHAR(200) NOT NULL,
    [UsrSystemCompanyID] NVARCHAR(100),
    [BranchID] INT,
    CONSTRAINT [PK_HIALaborSchedulesUserHotels] PRIMARY KEY CLUSTERED ([UserHotelID])
);

-- CreateTable
CREATE TABLE [dbo].[HIALaborSchedulesUserDepts] (
    [UserDeptID] INT NOT NULL IDENTITY(1,1),
    [UserID] INT NOT NULL,
    [Tenant] NVARCHAR(200) NOT NULL,
    [HotelName] NVARCHAR(200) NOT NULL,
    [DeptName] NVARCHAR(200) NOT NULL,
    CONSTRAINT [PK_HIALaborSchedulesUserDepts] PRIMARY KEY CLUSTERED ([UserDeptID])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [HIALaborSchedulesUsers_Email_key] ON [dbo].[HIALaborSchedulesUsers]([Email] ASC);

-- AddForeignKey
ALTER TABLE [dbo].[HIALaborSchedulesUserTenants] ADD CONSTRAINT [HIALaborSchedulesUserTenants_UserID_fkey] FOREIGN KEY ([UserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[HIALaborSchedulesUserHotels] ADD CONSTRAINT [HIALaborSchedulesUserHotels_UserID_fkey] FOREIGN KEY ([UserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[HIALaborSchedulesUserDepts] ADD CONSTRAINT [HIALaborSchedulesUserDepts_UserID_fkey] FOREIGN KEY ([UserID]) REFERENCES [dbo].[HIALaborSchedulesUsers]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
