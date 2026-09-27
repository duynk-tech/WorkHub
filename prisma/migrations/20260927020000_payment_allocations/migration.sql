CREATE TABLE `CustomerPaymentAllocation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `paymentId` INTEGER NOT NULL,
  `orderId` INTEGER NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `CustomerPaymentAllocation_paymentId_orderId_key` (`paymentId`, `orderId`),
  INDEX `CustomerPaymentAllocation_orderId_idx` (`orderId`),
  CONSTRAINT `CustomerPaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `CustomerPayment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CustomerPaymentAllocation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `CustomerOrder` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupplierPaymentAllocation` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `paymentId` INTEGER NOT NULL,
  `orderId` INTEGER NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SupplierPaymentAllocation_paymentId_orderId_key` (`paymentId`, `orderId`),
  INDEX `SupplierPaymentAllocation_orderId_idx` (`orderId`),
  CONSTRAINT `SupplierPaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `SupplierPayment` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SupplierPaymentAllocation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `SparePartOrder` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


ALTER TABLE `CustomerPayment` ADD COLUMN `allocationVersion` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `SupplierPayment` ADD COLUMN `allocationVersion` INTEGER NOT NULL DEFAULT 0;
