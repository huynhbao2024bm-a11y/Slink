ALTER TABLE returns ADD COLUMN restock_warehouse_id uuid;

UPDATE returns r
SET restock_warehouse_id = o.warehouse_id
FROM orders o
WHERE o.store_id = r.store_id
  AND o.id = r.order_id
  AND r.restock_policy = 'restock';

ALTER TABLE returns
  ADD CONSTRAINT returns_restock_warehouse_fk
  FOREIGN KEY (store_id, restock_warehouse_id)
  REFERENCES warehouses (store_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT returns_restock_warehouse_policy_check
  CHECK (
    (restock_policy = 'restock' AND restock_warehouse_id IS NOT NULL)
    OR (restock_policy <> 'restock' AND restock_warehouse_id IS NULL)
  );
