CREATE TABLE `ExternalIdentity` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ExternalIdentity_provider_subject_key` (`provider`, `subject`),
  UNIQUE INDEX `ExternalIdentity_userId_provider_key` (`userId`, `provider`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ExternalIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
