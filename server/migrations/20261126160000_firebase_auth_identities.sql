ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'password';

CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_idx
  ON users (firebase_uid) WHERE firebase_uid IS NOT NULL;
