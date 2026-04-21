-- One-time migration: Add auto-increment primary key to HIALaborSchedules
-- Run this BEFORE using Prisma with the schedule table.
-- This is non-destructive — existing data is preserved.

-- Only add if the column doesn't already exist
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HIALaborSchedules' AND COLUMN_NAME = 'Id'
)
BEGIN
    ALTER TABLE HIALaborSchedules ADD Id INT IDENTITY(1,1) NOT NULL;
    ALTER TABLE HIALaborSchedules ADD CONSTRAINT PK_HIALaborSchedules PRIMARY KEY (Id);
END
GO

-- Ensure UserTenants has an Id PK (may already have one)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HIALaborSchedulesUserTenants' AND COLUMN_NAME = 'Id'
)
BEGIN
    ALTER TABLE HIALaborSchedulesUserTenants ADD Id INT IDENTITY(1,1) NOT NULL;
    ALTER TABLE HIALaborSchedulesUserTenants ADD CONSTRAINT PK_HIALaborSchedulesUserTenants PRIMARY KEY (Id);
END
GO

-- Ensure UserHotels has an Id PK
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HIALaborSchedulesUserHotels' AND COLUMN_NAME = 'Id'
)
BEGIN
    ALTER TABLE HIALaborSchedulesUserHotels ADD Id INT IDENTITY(1,1) NOT NULL;
    ALTER TABLE HIALaborSchedulesUserHotels ADD CONSTRAINT PK_HIALaborSchedulesUserHotels PRIMARY KEY (Id);
END
GO

-- Ensure UserDepts has an Id PK
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HIALaborSchedulesUserDepts' AND COLUMN_NAME = 'Id'
)
BEGIN
    ALTER TABLE HIALaborSchedulesUserDepts ADD Id INT IDENTITY(1,1) NOT NULL;
    ALTER TABLE HIALaborSchedulesUserDepts ADD CONSTRAINT PK_HIALaborSchedulesUserDepts PRIMARY KEY (Id);
END
GO
