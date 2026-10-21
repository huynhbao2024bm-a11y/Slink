ALTER TABLE orders ADD COLUMN void_restock_warehouse_id uuid;

UPDATE orders o
SET void_restock_warehouse_id = COALESCE(
  (
    SELECT m.warehouse_id
    FROM inventory_movements m
    WHERE m.store_id = o.store_id
      AND m.source_type = 'order_void'
      AND m.source_id = o.id
      AND m.movement_type = 'reversal'
    ORDER BY m.occurred_at, m.id
    LIMIT 1
  ),
  o.warehouse_id
)
WHERE o.status = 'voided';

ALTER TABLE orders
  ADD CONSTRAINT orders_void_restock_warehouse_fk
  FOREIGN KEY (store_id, void_restock_warehouse_id)
  REFERENCES warehouses (store_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT orders_void_restock_warehouse_status_check
  CHECK (
    (status = 'voided' AND void_restock_warehouse_id IS NOT NULL)
    OR (status <> 'voided' AND void_restock_warehouse_id IS NULL)
  );
