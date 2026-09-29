ALTER TABLE `CustomerQuotation`
    ADD COLUMN `exchangeRate` DECIMAL(15, 2) NOT NULL DEFAULT 32500,
    ADD COLUMN `marginPercent` DECIMAL(5, 2) NOT NULL DEFAULT 30,
    ADD COLUMN `pricingMethod` VARCHAR(16) NOT NULL DEFAULT 'MARGIN';

ALTER TABLE `CustomerQuotationItem`
    ADD COLUMN `unitPriceEur` DECIMAL(15, 2) NULL,
    ADD COLUMN `unitCostVnd` DECIMAL(15, 2) NULL,
    ADD COLUMN `shippingFee` DECIMAL(15, 2) NULL,
    ADD COLUMN `customsFee` DECIMAL(15, 2) NULL,
    ADD COLUMN `priceSource` VARCHAR(32) NULL;

ALTER TABLE `CustomerOrder`
    ADD COLUMN `exchangeRate` DECIMAL(15, 2) NULL;

ALTER TABLE `CustomerOrderItem`
    ADD COLUMN `unitPriceEur` DECIMAL(15, 2) NULL;
