ALTER TABLE channel_orders
  ADD COLUMN customer_phone_snapshot text NOT NULL DEFAULT ''
    CHECK (length(customer_phone_snapshot) <= 32),
  ADD COLUMN shipping_address_snapshot text NOT NULL DEFAULT ''
    CHECK (length(shipping_address_snapshot) <= 500);
