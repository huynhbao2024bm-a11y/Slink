#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -- "$0" "$@"
fi
if [ "$#" -ne 1 ] || ! [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'Usage: activate-host.sh vMAJOR.MINOR.PATCH' >&2
  exit 2
fi

source /etc/slink/release.env
if [[ "$SLINK_DOMAIN" == *example.invalid* ]] || [[ "$SLINK_BACKUP_BUCKET" == "pending" ]]; then
  echo 'The hostname and backup bucket must be configured before activation.' >&2
  exit 1
fi
if [ -f /etc/slink/app.env ]; then
  echo 'Slink is already activated. Use deploy-release.sh for a later release.' >&2
  exit 1
fi

external_ip="$(curl --fail --silent --show-error -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)"
resolved_ips="$(getent ahostsv4 "$SLINK_DOMAIN" | awk '{print $1}' | sort -u || true)"
if ! printf '%s\n' "$resolved_ips" | grep -Fxq "$external_ip"; then
  echo "DNS for $SLINK_DOMAIN must resolve to this VM's reserved IPv4 address $external_ip before activation." >&2
  exit 1
fi

secret_root=/etc/slink/secrets
install -d -m 0700 "$secret_root"
fetch_secret() {
  local secret_id="$1" destination="$2" owner="$3" group="$4" mode="$5"
  local temp="${destination}.tmp.$$"
  umask 077
  gcloud secrets versions access latest --secret="$secret_id" --project="$SLINK_PROJECT_ID" > "$temp"
  test -s "$temp" || { rm -f "$temp"; echo "Secret '$secret_id' is empty." >&2; return 1; }
  chown "$owner:$group" "$temp"
  chmod "$mode" "$temp"
  mv -f "$temp" "$destination"
}

fetch_secret postgres-admin-password "$secret_root/postgres-admin-password" root 999 0440
fetch_secret slink-app-password "$secret_root/slink-app-password" root 999 0440
fetch_secret slink-migrator-password "$secret_root/slink-migrator-password" root 999 0440
fetch_secret email-delivery-url "$secret_root/email-delivery-url" 1000 1000 0400
fetch_secret email-delivery-token "$secret_root/email-delivery-token" 1000 1000 0400
fetch_secret backup-encryption-key-v1 "$secret_root/backup-encryption-key-v1" 1000 1000 0400

python3 - "$secret_root" <<'PY'
import base64
import sys
from pathlib import Path
from urllib.parse import urlsplit

root = Path(sys.argv[1])
for name in ('postgres-admin-password', 'slink-app-password', 'slink-migrator-password', 'email-delivery-token'):
    if len((root / name).read_text(encoding='utf-8').rstrip('\r\n')) < 32:
        raise SystemExit(f"Secret '{name}' must contain at least 32 characters.")
email_url = (root / 'email-delivery-url').read_text(encoding='utf-8').strip()
if urlsplit(email_url).scheme != 'https' or not urlsplit(email_url).netloc:
    raise SystemExit("Secret 'email-delivery-url' must be an HTTPS URL.")
key = (root / 'backup-encryption-key-v1').read_text(encoding='utf-8').strip()
try:
    decoded = base64.b64decode(key, validate=True)
except Exception as error:
    raise SystemExit('Backup encryption key must be valid base64.') from error
if len(decoded) != 32:
    raise SystemExit('Backup encryption key must decode to exactly 32 bytes.')
PY

APP_DB_PASSWORD="$(cat "$secret_root/slink-app-password")" \
MIGRATOR_DB_PASSWORD="$(cat "$secret_root/slink-migrator-password")" \
python3 - <<'PY'
import os
from pathlib import Path
from urllib.parse import quote, urlencode

root = Path('/etc/slink/secrets')
app_password = quote(os.environ['APP_DB_PASSWORD'], safe='')
migrator_password = quote(os.environ['MIGRATOR_DB_PASSWORD'], safe='')
host = 'database:5432/slink'
urls = {
    'app-database-url': f'postgresql://slink_app:{app_password}@{host}',
    'migration-database-url': f'postgresql://slink_migrator:{migrator_password}@{host}',
    'backup-database-url': f'postgresql://slink_migrator:{migrator_password}@{host}?{urlencode({"sslmode": "verify-full", "sslrootcert": "/run/secrets/database_ca_certificate"})}',
}
for filename, value in urls.items():
    path = root / filename
    path.write_text(value, encoding='utf-8')
    path.chmod(0o400)
    os.chown(path, 1000, 1000)
PY

cat > /etc/slink/app.env <<EOF
PUBLIC_ORIGIN=https://${SLINK_DOMAIN}
EMAIL_FROM="Slink <no-reply@${SLINK_DOMAIN}>"
EOF
cat > /etc/slink/operations.env <<'EOF'
SLINK_BACKUP_DIR=/backups
EOF
chmod 0600 /etc/slink/app.env /etc/slink/operations.env

api_image="${SLINK_REGION}-docker.pkg.dev/${SLINK_PROJECT_ID}/slink/slink-api:$1"
ops_image="${SLINK_REGION}-docker.pkg.dev/${SLINK_PROJECT_ID}/slink/slink-ops:$1"
release_tmp=/etc/slink/release.env.new
cat > "$release_tmp" <<EOF
SLINK_PROJECT_ID=${SLINK_PROJECT_ID}
SLINK_REGION=${SLINK_REGION}
SLINK_DOMAIN=${SLINK_DOMAIN}
SLINK_BACKUP_BUCKET=${SLINK_BACKUP_BUCKET}
SLINK_API_IMAGE=${api_image}
SLINK_OPS_IMAGE=${ops_image}
EOF
chmod 0600 "$release_tmp"
mv -f "$release_tmp" /etc/slink/release.env

compose=(docker compose --env-file /etc/slink/release.env --file /opt/slink/compose.yaml)
"${compose[@]}" pull database proxy api operations
"${compose[@]}" up -d database
database_id="$("${compose[@]}" ps -q database)"
for attempt in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$database_id" 2>/dev/null || true)"
  if [ "$status" = healthy ]; then break; fi
  if [ "$attempt" -eq 60 ]; then
    echo 'PostgreSQL did not become healthy. Review docker compose logs database.' >&2
    exit 1
  fi
  sleep 2
done

"${compose[@]}" --profile operations run --rm operations server/migrate.js
"${compose[@]}" --profile operations run --rm operations scripts/postgres-role-check.js
"${compose[@]}" up -d api
api_id="$("${compose[@]}" ps -q api)"
for attempt in $(seq 1 45); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$api_id" 2>/dev/null || true)"
  if [ "$status" = healthy ]; then break; fi
  if [ "$attempt" -eq 45 ]; then
    echo 'Slink API did not become healthy. Review docker compose logs api.' >&2
    exit 1
  fi
  sleep 2
done

"${compose[@]}" up -d proxy
install -m 0644 /opt/slink/backup.service /etc/systemd/system/slink-backup.service
install -m 0644 /opt/slink/backup.timer /etc/systemd/system/slink-backup.timer
systemctl daemon-reload
systemctl enable --now slink-backup.timer
"/opt/slink/backup.sh"
echo 'Slink host activated. Check the domain in a browser, finish account setup, then verify the first encrypted backup in Cloud Storage.'
