ALTER TABLE stores
  ADD COLUMN business_profile text
    CHECK (business_profile IN ('retail', 'online', 'warehouse', 'large_business', 'unsure')),
  ADD COLUMN onboarding_completed_at timestamptz;
