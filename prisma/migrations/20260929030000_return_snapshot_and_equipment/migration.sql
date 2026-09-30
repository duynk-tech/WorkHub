ALTER TABLE `CustomerReturn`
    ADD COLUMN `vatAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0;

ALTER TABLE `CustomerReturnItem`
    ADD COLUMN `equipmentId` INTEGER NULL,
    ADD INDEX `CustomerReturnItem_equipmentId_idx`(`equipmentId`),
    ADD CONSTRAINT `CustomerReturnItem_equipmentId_fkey`
        FOREIGN KEY (`equipmentId`) REFERENCES `FnbEquipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `FnbEquipment`
    ADD COLUMN `customerOrderItemId` INTEGER NULL,
    ADD INDEX `FnbEquipment_customerOrderItemId_idx`(`customerOrderItemId`),
    ADD CONSTRAINT `FnbEquipment_customerOrderItemId_fkey`
        FOREIGN KEY (`customerOrderItemId`) REFERENCES `CustomerOrderItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Bind explicitly tracked machines to their exact source line.
UPDATE `FnbEquipment` e
JOIN `CustomerOrderItem` oi ON oi.`equipmentId` = e.`id`
SET e.`customerOrderItemId` = oi.`id`
WHERE e.`customerOrderItemId` IS NULL;

-- For older stock machines, backfill only when one machine line exists and its
-- quantity exactly matches the number of machine records on that order.
UPDATE `FnbEquipment` e
JOIN (
    SELECT oi.`id` AS `orderItemId`, oi.`orderId`
    FROM `CustomerOrderItem` oi
    JOIN (
        SELECT `orderId`, SUM(CASE WHEN `itemType` = 'EQUIPMENT' THEN 1 ELSE 0 END) AS `machineLineCount`
        FROM `CustomerOrderItem`
        GROUP BY `orderId`
    ) lines ON lines.`orderId` = oi.`orderId` AND lines.`machineLineCount` = 1
    JOIN (
        SELECT `customerOrderId`, COUNT(*) AS `machineCount`
        FROM `FnbEquipment`
        WHERE `customerOrderId` IS NOT NULL
        GROUP BY `customerOrderId`
    ) machines ON machines.`customerOrderId` = oi.`orderId` AND machines.`machineCount` = oi.`quantity`
    WHERE oi.`itemType` = 'EQUIPMENT' AND oi.`equipmentId` IS NULL
) safeLine ON safeLine.`orderId` = e.`customerOrderId`
SET e.`customerOrderItemId` = safeLine.`orderItemId`
WHERE e.`customerOrderItemId` IS NULL;

-- Older releases stored return totals net of VAT. Detect any rows that already
-- contain the gross total before changing them, to avoid adding VAT twice.
CREATE TEMPORARY TABLE `_CustomerReturnVatBackfill` AS
SELECT cr.`orderId`, SUM(
    CASE
        WHEN ABS(cr.`totalValue` - COALESCE(items.`goodsValue`, cr.`totalValue`)) <= 0.01
        THEN ROUND(COALESCE(items.`goodsValue`, cr.`totalValue`) * co.`vatRate` / 100, 2)
        ELSE 0
    END
) AS `vatToAdd`
FROM `CustomerReturn` cr
JOIN `CustomerOrder` co ON co.`id` = cr.`orderId`
LEFT JOIN (
    SELECT `returnId`, SUM(`totalPrice`) AS `goodsValue`
    FROM `CustomerReturnItem`
    GROUP BY `returnId`
) items ON items.`returnId` = cr.`id`
WHERE cr.`orderId` IS NOT NULL
GROUP BY cr.`orderId`;

UPDATE `CustomerOrder` co
JOIN `_CustomerReturnVatBackfill` backfill ON backfill.`orderId` = co.`id`
SET co.`returnedAmount` = co.`returnedAmount` + backfill.`vatToAdd`;

DROP TEMPORARY TABLE `_CustomerReturnVatBackfill`;

UPDATE `CustomerReturn` cr
JOIN `CustomerOrder` co ON co.`id` = cr.`orderId`
LEFT JOIN (
    SELECT `returnId`, SUM(`totalPrice`) AS `goodsValue`
    FROM `CustomerReturnItem`
    GROUP BY `returnId`
) items ON items.`returnId` = cr.`id`
SET cr.`vatAmount` = ROUND(COALESCE(items.`goodsValue`, cr.`totalValue`) * co.`vatRate` / 100, 2),
    cr.`totalValue` = CASE
        WHEN ABS(cr.`totalValue` - COALESCE(items.`goodsValue`, cr.`totalValue`)) <= 0.01
        THEN cr.`totalValue` + ROUND(COALESCE(items.`goodsValue`, cr.`totalValue`) * co.`vatRate` / 100, 2)
        ELSE cr.`totalValue`
    END
WHERE cr.`orderId` IS NOT NULL;
