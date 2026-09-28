ALTER TABLE `InventoryItem`
    ADD COLUMN `avgBaseCost` DECIMAL(15, 2) NULL,
    ADD COLUMN `avgShippingCost` DECIMAL(15, 2) NULL,
    ADD COLUMN `avgOtherCost` DECIMAL(15, 2) NULL;

ALTER TABLE `InventoryTransactionItem`
    ADD COLUMN `baseUnitCost` DECIMAL(15, 2) NULL,
    ADD COLUMN `shippingUnitCost` DECIMAL(15, 2) NULL,
    ADD COLUMN `otherUnitCost` DECIMAL(15, 2) NULL;

ALTER TABLE `CustomerOrderItem`
    ADD COLUMN `discountAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- Existing order line totals already contain their allocated discount. Preserve
-- that historical value explicitly without changing the line total or order.
UPDATE `CustomerOrderItem`
SET `discountAmount` = GREATEST(0, (`quantity` * `unitPrice`) - `totalPrice`);
