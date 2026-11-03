ALTER TABLE users ADD COLUMN workspace_mode text NOT NULL DEFAULT 'shop'
  CHECK (workspace_mode IN ('shop', 'affiliate'));

CREATE TABLE affiliate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('tiktok', 'shopee')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  affiliate_url text NOT NULL CHECK (length(affiliate_url) BETWEEN 10 AND 2048),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, affiliate_url)
);
CREATE INDEX affiliate_links_personal_list ON affiliate_links(user_id, status, updated_at DESC, id);
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links FORCE ROW LEVEL SECURITY;
CREATE POLICY personal_scope ON affiliate_links
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.affiliate_links TO slink_app;
  END IF;
END;
$$;
