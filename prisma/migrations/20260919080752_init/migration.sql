-- CreateTable
CREATE TABLE `Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `parentId` INTEGER NULL,
    `path` VARCHAR(512) NOT NULL DEFAULT '/',
    `level` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `managerId` INTEGER NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(32) NULL,
    `costCenter` VARCHAR(64) NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Department_code_key`(`code`),
    INDEX `Department_parentId_idx`(`parentId`),
    INDEX `Department_path_idx`(`path`),
    INDEX `Department_managerId_idx`(`managerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Position` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `rankLevel` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Position_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(32) NULL,
    `zaloUserId` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `departmentId` INTEGER NULL,
    `positionId` INTEGER NULL,
    `managerId` INTEGER NULL,
    `workShiftId` INTEGER NULL,
    `employmentType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION') NOT NULL DEFAULT 'FULL_TIME',
    `status` ENUM('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED') NOT NULL DEFAULT 'ACTIVE',
    `gender` VARCHAR(16) NULL,
    `dateOfBirth` DATE NULL,
    `joinDate` DATE NULL,
    `leaveDate` DATE NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_code_key`(`code`),
    UNIQUE INDEX `Employee_email_key`(`email`),
    UNIQUE INDEX `Employee_zaloUserId_key`(`zaloUserId`),
    INDEX `Employee_departmentId_idx`(`departmentId`),
    INDEX `Employee_managerId_idx`(`managerId`),
    INDEX `Employee_positionId_idx`(`positionId`),
    INDEX `Employee_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginIp` VARCHAR(64) NULL,
    `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'vi',
    `theme` VARCHAR(16) NOT NULL DEFAULT 'system',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_employeeId_key`(`employeeId`),
    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `dataScope` ENUM('ALL', 'DEPT_TREE', 'DEPT', 'SELF', 'CUSTOM') NOT NULL DEFAULT 'SELF',
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(64) NOT NULL,
    `category` ENUM('MENU', 'FEATURE') NOT NULL DEFAULT 'FEATURE',
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` INTEGER NOT NULL,
    `permissionCode` VARCHAR(64) NOT NULL,

    INDEX `RolePermission_permissionCode_idx`(`permissionCode`),
    PRIMARY KEY (`roleId`, `permissionCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `userId` INTEGER NOT NULL,
    `roleId` INTEGER NOT NULL,

    INDEX `UserRole_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoleDeptScope` (
    `roleId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,

    INDEX `RoleDeptScope_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`roleId`, `departmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `departmentId` INTEGER NULL,
    `creatorId` INTEGER NOT NULL,
    `assigneeId` INTEGER NULL,
    `reviewerId` INTEGER NULL,
    `parentTaskId` INTEGER NULL,
    `status` ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED', 'CANCELLED') NOT NULL DEFAULT 'TODO',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `startDate` DATETIME(3) NULL,
    `dueDate` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `estimateHours` DECIMAL(7, 2) NULL,
    `actualHours` DECIMAL(7, 2) NULL,
    `tags` VARCHAR(512) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `recurrenceRule` VARCHAR(255) NULL,
    `source` ENUM('WEB', 'ZALO', 'MCP', 'IMPORT', 'SYSTEM') NOT NULL DEFAULT 'WEB',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Task_code_key`(`code`),
    INDEX `Task_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `Task_departmentId_status_idx`(`departmentId`, `status`),
    INDEX `Task_dueDate_idx`(`dueDate`),
    INDEX `Task_creatorId_idx`(`creatorId`),
    INDEX `Task_parentTaskId_idx`(`parentTaskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskWatcher` (
    `taskId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,

    INDEX `TaskWatcher_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`taskId`, `employeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskChecklistItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `content` VARCHAR(512) NOT NULL,
    `isDone` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `completedAt` DATETIME(3) NULL,

    INDEX `TaskChecklistItem_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskComment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `authorId` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `source` ENUM('WEB', 'ZALO', 'MCP', 'IMPORT', 'SYSTEM') NOT NULL DEFAULT 'WEB',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskComment_taskId_idx`(`taskId`),
    INDEX `TaskComment_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskAttachment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `filePath` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(128) NULL,
    `sizeBytes` INTEGER NOT NULL DEFAULT 0,
    `uploadedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskAttachment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskTimeLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `workDate` DATE NOT NULL,
    `hours` DECIMAL(5, 2) NOT NULL,
    `description` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskTimeLog_taskId_idx`(`taskId`),
    INDEX `TaskTimeLog_employeeId_workDate_idx`(`employeeId`, `workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `actorId` INTEGER NULL,
    `action` VARCHAR(64) NOT NULL,
    `field` VARCHAR(64) NULL,
    `oldValue` TEXT NULL,
    `newValue` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskActivity_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskReminder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `offsetMinutesBeforeDue` INTEGER NOT NULL DEFAULT 1440,
    `channels` VARCHAR(64) NOT NULL DEFAULT 'ZALO,IN_APP',
    `targetAssignee` BOOLEAN NOT NULL DEFAULT true,
    `targetWatchers` BOOLEAN NOT NULL DEFAULT false,
    `targetManager` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskReminder_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `defaultDaysPerYear` DECIMAL(5, 1) NOT NULL DEFAULT 12,
    `isPaid` BOOLEAN NOT NULL DEFAULT true,
    `deductsBalance` BOOLEAN NOT NULL DEFAULT true,
    `requiresAttachment` BOOLEAN NOT NULL DEFAULT false,
    `allowHalfDay` BOOLEAN NOT NULL DEFAULT true,
    `minAdvanceDays` INTEGER NOT NULL DEFAULT 1,
    `maxConsecutiveDays` INTEGER NULL,
    `workflowDefinitionId` INTEGER NULL,
    `color` VARCHAR(16) NOT NULL DEFAULT '#3b82f6',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LeaveType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveBalance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `standardDays` DECIMAL(5, 1) NOT NULL DEFAULT 12,
    `bonusDays` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `carriedOverDays` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `usedDays` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `pendingDays` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `note` VARCHAR(512) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveBalance_year_idx`(`year`),
    UNIQUE INDEX `LeaveBalance_employeeId_year_key`(`employeeId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `durationType` ENUM('FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON') NOT NULL DEFAULT 'FULL_DAY',
    `totalDays` DECIMAL(5, 1) NOT NULL DEFAULT 1,
    `reason` TEXT NOT NULL,
    `attachmentUrl` VARCHAR(512) NULL,
    `attachmentName` VARCHAR(255) NULL,
    `handoverToId` INTEGER NULL,
    `handoverNote` TEXT NULL,
    `contactDuringLeave` VARCHAR(64) NULL,
    `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `workflowInstanceId` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `closingNote` TEXT NULL,
    `source` ENUM('WEB', 'ZALO', 'MCP', 'IMPORT', 'SYSTEM') NOT NULL DEFAULT 'WEB',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LeaveRequest_code_key`(`code`),
    UNIQUE INDEX `LeaveRequest_workflowInstanceId_key`(`workflowInstanceId`),
    INDEX `LeaveRequest_employeeId_status_idx`(`employeeId`, `status`),
    INDEX `LeaveRequest_startDate_endDate_idx`(`startDate`, `endDate`),
    INDEX `LeaveRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequestDay` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `portion` DECIMAL(3, 1) NOT NULL DEFAULT 1.0,

    INDEX `LeaveRequestDay_date_idx`(`date`),
    UNIQUE INDEX `LeaveRequestDay_requestId_date_key`(`requestId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isPaid` BOOLEAN NOT NULL DEFAULT true,
    `year` INTEGER NOT NULL,

    UNIQUE INDEX `Holiday_date_key`(`date`),
    INDEX `Holiday_year_idx`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowDefinition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `entityType` ENUM('LEAVE', 'OVERTIME', 'ATTENDANCE_ADJUST', 'TASK_CLOSE') NOT NULL DEFAULT 'LEAVE',
    `version` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `appliesToJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkflowDefinition_code_key`(`code`),
    INDEX `WorkflowDefinition_entityType_isActive_idx`(`entityType`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStep` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `definitionId` INTEGER NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `approverType` ENUM('DIRECT_MANAGER', 'MANAGER_CHAIN_LEVEL', 'DEPT_HEAD', 'PARENT_DEPT_HEAD', 'ROLE', 'POSITION_RANK', 'SPECIFIC_USER', 'HR') NOT NULL,
    `roleId` INTEGER NULL,
    `positionRank` INTEGER NULL,
    `specificEmployeeId` INTEGER NULL,
    `chainLevel` INTEGER NULL,
    `mode` ENUM('SEQUENTIAL', 'PARALLEL_ALL', 'PARALLEL_ANY') NOT NULL DEFAULT 'SEQUENTIAL',
    `conditionJson` JSON NULL,
    `slaHours` INTEGER NULL,
    `allowDelegate` BOOLEAN NOT NULL DEFAULT true,
    `skipIfSameAsRequester` BOOLEAN NOT NULL DEFAULT true,
    `skipIfNoApprover` BOOLEAN NOT NULL DEFAULT true,
    `notifyOnly` BOOLEAN NOT NULL DEFAULT false,

    INDEX `WorkflowStep_roleId_idx`(`roleId`),
    INDEX `WorkflowStep_specificEmployeeId_idx`(`specificEmployeeId`),
    UNIQUE INDEX `WorkflowStep_definitionId_stepOrder_key`(`definitionId`, `stepOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowInstance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `definitionId` INTEGER NOT NULL,
    `entityType` ENUM('LEAVE', 'OVERTIME', 'ATTENDANCE_ADJUST', 'TASK_CLOSE') NOT NULL,
    `entityId` INTEGER NOT NULL,
    `requesterId` INTEGER NOT NULL,
    `status` ENUM('RUNNING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'RUNNING',
    `currentStepOrder` INTEGER NOT NULL DEFAULT 1,
    `contextJson` JSON NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `WorkflowInstance_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `WorkflowInstance_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instanceId` INTEGER NOT NULL,
    `stepId` INTEGER NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `approverId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'DELEGATED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `comment` TEXT NULL,
    `actedAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `delegatedFromId` INTEGER NULL,
    `remindedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApprovalTask_instanceId_stepOrder_idx`(`instanceId`, `stepOrder`),
    INDEX `ApprovalTask_approverId_status_idx`(`approverId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instanceId` INTEGER NOT NULL,
    `actorId` INTEGER NULL,
    `action` VARCHAR(64) NOT NULL,
    `fromStatus` VARCHAR(32) NULL,
    `toStatus` VARCHAR(32) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkflowLog_instanceId_idx`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkShift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NOT NULL,
    `breakMinutes` INTEGER NOT NULL DEFAULT 60,
    `lateToleranceMin` INTEGER NOT NULL DEFAULT 5,
    `workDays` INTEGER NOT NULL DEFAULT 62,
    `standardHours` DECIMAL(4, 2) NOT NULL DEFAULT 8,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkShift_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfficeLocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(512) NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `radiusMeters` INTEGER NOT NULL DEFAULT 200,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `workDate` DATE NOT NULL,
    `shiftId` INTEGER NULL,
    `checkInAt` DATETIME(3) NULL,
    `checkOutAt` DATETIME(3) NULL,
    `source` ENUM('WEB', 'ZALO', 'MCP', 'IMPORT', 'SYSTEM') NOT NULL DEFAULT 'WEB',
    `checkInLat` DECIMAL(10, 7) NULL,
    `checkInLng` DECIMAL(10, 7) NULL,
    `checkInAddress` VARCHAR(512) NULL,
    `checkOutLat` DECIMAL(10, 7) NULL,
    `checkOutLng` DECIMAL(10, 7) NULL,
    `deviceInfo` VARCHAR(255) NULL,
    `lateMinutes` INTEGER NOT NULL DEFAULT 0,
    `earlyLeaveMinutes` INTEGER NOT NULL DEFAULT 0,
    `workedMinutes` INTEGER NOT NULL DEFAULT 0,
    `otMinutes` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PRESENT', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'WFH', 'MISSING_CHECKOUT') NOT NULL DEFAULT 'PRESENT',
    `note` VARCHAR(512) NULL,
    `importBatchId` INTEGER NULL,
    `editedById` INTEGER NULL,
    `editedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttendanceRecord_workDate_idx`(`workDate`),
    INDEX `AttendanceRecord_status_idx`(`status`),
    UNIQUE INDEX `AttendanceRecord_employeeId_workDate_key`(`employeeId`, `workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceImportBatch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fileName` VARCHAR(255) NOT NULL,
    `importedById` INTEGER NULL,
    `rowCount` INTEGER NOT NULL DEFAULT 0,
    `okCount` INTEGER NOT NULL DEFAULT 0,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `logJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceAdjustment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` INTEGER NOT NULL,
    `requestedById` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `proposedJson` JSON NOT NULL,
    `workflowInstanceId` INTEGER NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'DELEGATED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `AttendanceAdjustment_recordId_idx`(`recordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationTemplate` (
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `channel` ENUM('ZALO', 'IN_APP', 'EMAIL') NOT NULL DEFAULT 'ZALO',
    `title` VARCHAR(255) NULL,
    `bodyTemplate` TEXT NOT NULL,
    `variablesJson` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationOutbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `channel` ENUM('ZALO', 'IN_APP', 'EMAIL') NOT NULL DEFAULT 'ZALO',
    `templateCode` VARCHAR(64) NULL,
    `recipientEmployeeId` INTEGER NULL,
    `zaloUserId` VARCHAR(191) NULL,
    `title` VARCHAR(255) NULL,
    `body` TEXT NOT NULL,
    `payloadJson` JSON NULL,
    `linkUrl` VARCHAR(512) NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `sendAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NotificationOutbox_dedupeKey_key`(`dedupeKey`),
    INDEX `NotificationOutbox_status_sendAfter_idx`(`status`, `sendAfter`),
    INDEX `NotificationOutbox_recipientEmployeeId_idx`(`recipientEmployeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InAppNotification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `linkUrl` VARCHAR(512) NULL,
    `icon` VARCHAR(32) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InAppNotification_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZaloLinkCode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ZaloLinkCode_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZaloInboundLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `messageId` VARCHAR(191) NULL,
    `zaloUserId` VARCHAR(191) NULL,
    `text` TEXT NULL,
    `payloadJson` JSON NULL,
    `handled` BOOLEAN NOT NULL DEFAULT false,
    `response` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ZaloInboundLog_messageId_key`(`messageId`),
    INDEX `ZaloInboundLog_zaloUserId_idx`(`zaloUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(128) NOT NULL,
    `valueJson` JSON NOT NULL,
    `groupName` VARCHAR(64) NOT NULL DEFAULT 'general',
    `isSecret` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SystemSetting_groupName_idx`(`groupName`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpClient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(16) NOT NULL,
    `keyHash` VARCHAR(255) NOT NULL,
    `scopesJson` JSON NOT NULL,
    `actAsUserId` INTEGER NOT NULL,
    `readOnly` BOOLEAN NOT NULL DEFAULT true,
    `rateLimitPerMin` INTEGER NOT NULL DEFAULT 60,
    `allowedIps` VARCHAR(512) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `callCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `McpClient_keyPrefix_key`(`keyPrefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `McpCallLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` INTEGER NOT NULL,
    `toolName` VARCHAR(128) NOT NULL,
    `argsJson` JSON NULL,
    `success` BOOLEAN NOT NULL DEFAULT true,
    `error` TEXT NULL,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `McpCallLog_clientId_createdAt_idx`(`clientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboundWebhook` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `url` VARCHAR(512) NOT NULL,
    `events` VARCHAR(512) NOT NULL,
    `secret` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastStatus` INTEGER NULL,
    `lastCalledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorId` INTEGER NULL,
    `entityType` VARCHAR(64) NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `action` VARCHAR(64) NOT NULL,
    `diffJson` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `source` ENUM('WEB', 'ZALO', 'MCP', 'IMPORT', 'SYSTEM') NOT NULL DEFAULT 'WEB',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportPreset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `reportKey` VARCHAR(64) NOT NULL,
    `filtersJson` JSON NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `isShared` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReportPreset_reportKey_idx`(`reportKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportSchedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `reportKey` VARCHAR(64) NOT NULL,
    `filtersJson` JSON NULL,
    `cronExpr` VARCHAR(64) NOT NULL,
    `channel` ENUM('ZALO', 'IN_APP', 'EMAIL') NOT NULL DEFAULT 'ZALO',
    `recipientsJson` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `Position`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_workShiftId_fkey` FOREIGN KEY (`workShiftId`) REFERENCES `WorkShift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionCode_fkey` FOREIGN KEY (`permissionCode`) REFERENCES `Permission`(`code`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleDeptScope` ADD CONSTRAINT `RoleDeptScope_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoleDeptScope` ADD CONSTRAINT `RoleDeptScope_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_parentTaskId_fkey` FOREIGN KEY (`parentTaskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskWatcher` ADD CONSTRAINT `TaskWatcher_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskWatcher` ADD CONSTRAINT `TaskWatcher_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskChecklistItem` ADD CONSTRAINT `TaskChecklistItem_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskComment` ADD CONSTRAINT `TaskComment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskComment` ADD CONSTRAINT `TaskComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAttachment` ADD CONSTRAINT `TaskAttachment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskTimeLog` ADD CONSTRAINT `TaskTimeLog_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskTimeLog` ADD CONSTRAINT `TaskTimeLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskActivity` ADD CONSTRAINT `TaskActivity_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskReminder` ADD CONSTRAINT `TaskReminder_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveType` ADD CONSTRAINT `LeaveType_workflowDefinitionId_fkey` FOREIGN KEY (`workflowDefinitionId`) REFERENCES `WorkflowDefinition`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_handoverToId_fkey` FOREIGN KEY (`handoverToId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_workflowInstanceId_fkey` FOREIGN KEY (`workflowInstanceId`) REFERENCES `WorkflowInstance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequestDay` ADD CONSTRAINT `LeaveRequestDay_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `LeaveRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `WorkflowDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_specificEmployeeId_fkey` FOREIGN KEY (`specificEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowInstance` ADD CONSTRAINT `WorkflowInstance_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `WorkflowDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalTask` ADD CONSTRAINT `ApprovalTask_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `WorkflowInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalTask` ADD CONSTRAINT `ApprovalTask_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `WorkflowStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalTask` ADD CONSTRAINT `ApprovalTask_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalTask` ADD CONSTRAINT `ApprovalTask_delegatedFromId_fkey` FOREIGN KEY (`delegatedFromId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowLog` ADD CONSTRAINT `WorkflowLog_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `WorkflowInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `WorkShift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `AttendanceImportBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceAdjustment` ADD CONSTRAINT `AttendanceAdjustment_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `AttendanceRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationOutbox` ADD CONSTRAINT `NotificationOutbox_recipientEmployeeId_fkey` FOREIGN KEY (`recipientEmployeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InAppNotification` ADD CONSTRAINT `InAppNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZaloLinkCode` ADD CONSTRAINT `ZaloLinkCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpClient` ADD CONSTRAINT `McpClient_actAsUserId_fkey` FOREIGN KEY (`actAsUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `McpCallLog` ADD CONSTRAINT `McpCallLog_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `McpClient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportPreset` ADD CONSTRAINT `ReportPreset_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
