ALTER TABLE `CustomerOrderItem`
    ADD COLUMN `unitCostVnd` DECIMAL(15, 2) NULL,
    ADD COLUMN `shippingFee` DECIMAL(15, 2) NULL,
    ADD COLUMN `customsFee` DECIMAL(15, 2) NULL;
