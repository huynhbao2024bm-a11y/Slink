-- Per-store encrypted third-party integration credentials (GHN, SePay, Casso, PayOS, MoMo, VNPAY, MISA, Viettel eInvoice)
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS integration_secrets_enc TEXT NOT NULL DEFAULT '';
