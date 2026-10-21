#!/bin/sh
set -eu

export SLINK_APP_PASSWORD="$(cat /run/secrets/slink_app_password)"
export SLINK_MIGRATOR_PASSWORD="$(cat /run/secrets/slink_migrator_password)"
if [ -z "$SLINK_APP_PASSWORD" ] || [ -z "$SLINK_MIGRATOR_PASSWORD" ]; then
  echo 'Slink database role secrets must be non-empty.' >&2
  exit 1
fi

psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  <<'SQL'
\getenv app_password SLINK_APP_PASSWORD
\getenv migrator_password SLINK_MIGRATOR_PASSWORD
SELECT format(
  'CREATE ROLE slink_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS PASSWORD %L',
  :'migrator_password'
) \gexec
SELECT format(
  'CREATE ROLE slink_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'app_password'
) \gexec
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE slink TO slink_migrator;
GRANT CONNECT ON DATABASE slink TO slink_app;
GRANT CREATE ON SCHEMA public TO slink_migrator;
GRANT USAGE ON SCHEMA public TO slink_app;
SQL

unset SLINK_APP_PASSWORD SLINK_MIGRATOR_PASSWORD
