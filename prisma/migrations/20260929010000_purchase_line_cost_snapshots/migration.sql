ALTER TABLE `SparePartOrderItem`
    ADD COLUMN `shippingFee` DECIMAL(15, 2) NULL,
    ADD COLUMN `customsFee` DECIMAL(15, 2) NULL;

ALTER TABLE `SparePartOrder`
    ALTER COLUMN `customsFee` SET DEFAULT 0,
    ALTER COLUMN `extraShippingRate` SET DEFAULT 0;
