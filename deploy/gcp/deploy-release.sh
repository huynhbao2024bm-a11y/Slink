#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then exec sudo -- "$0" "$@"; fi
if [ "$#" -ne 1 ] || ! [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'Usage: deploy-release.sh vMAJOR.MINOR.PATCH' >&2
  exit 2
fi

source /etc/slink/release.env
release="$1"
compose=(docker compose --env-file /etc/slink/release.env --file /opt/slink/compose.yaml)
exec 8>/run/lock/slink-deploy.lock
if ! flock -n 8; then
  echo 'Another Slink deployment is already running.' >&2
  exit 1
fi

backup_output="$(/opt/slink/backup.sh 2>&1)" || { printf '%s\n' "$backup_output" >&2; exit 1; }
printf '%s\n' "$backup_output"
backup_reference="$(printf '%s\n' "$backup_output" | sed -n 's/^Backup reference: //p' | tail -n 1)"
manifest_name="${backup_reference##*/}"
if [[ "$backup_reference" != "gs://${SLINK_BACKUP_BUCKET}/"* ]] || ! [[ "$manifest_name" =~ ^[A-Za-z0-9T._-]+\.slinkbackup\.manifest\.json$ ]]; then
  echo 'Could not identify the newly uploaded verified backup reference.' >&2
  exit 1
fi

verify_dir="/var/lib/slink/backups/.release-check-${release}-$$"
install -d -o 1000 -g 1000 -m 0700 "$verify_dir"
trap 'rm -rf -- "$verify_dir"' EXIT
gcloud storage cp "$backup_reference" "$verify_dir/$manifest_name"
archive_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["fileName"])' "$verify_dir/$manifest_name")"
if ! [[ "$archive_name" =~ ^[A-Za-z0-9T._-]+\.slinkbackup$ ]]; then
  echo 'Backup manifest names an unexpected archive file.' >&2
  exit 1
fi
gcloud storage cp "gs://${SLINK_BACKUP_BUCKET}/${archive_name}" "$verify_dir/$archive_name"
"${compose[@]}" --profile operations run --rm --no-deps \
  --volume "$verify_dir:/release-check:ro" operations \
  scripts/postgres-backup.js verify "/release-check/$manifest_name"

next_env="/etc/slink/release.env.next"
api_image="${SLINK_REGION}-docker.pkg.dev/${SLINK_PROJECT_ID}/slink/slink-api:${release}"
ops_image="${SLINK_REGION}-docker.pkg.dev/${SLINK_PROJECT_ID}/slink/slink-ops:${release}"
cat > "$next_env" <<EOF
SLINK_PROJECT_ID=${SLINK_PROJECT_ID}
SLINK_REGION=${SLINK_REGION}
SLINK_DOMAIN=${SLINK_DOMAIN}
SLINK_BACKUP_BUCKET=${SLINK_BACKUP_BUCKET}
SLINK_API_IMAGE=${api_image}
SLINK_OPS_IMAGE=${ops_image}
EOF
chmod 0600 "$next_env"
next_compose=(docker compose --env-file "$next_env" --file /opt/slink/compose.yaml)
"${next_compose[@]}" pull api operations

"${compose[@]}" stop api
migration_attempted=0
handle_error() {
  trap - ERR
  if [ "$migration_attempted" -eq 0 ]; then
    docker compose --env-file /etc/slink/release.env --file /opt/slink/compose.yaml up -d --no-deps api || true
  else
    echo 'Migration or post-migration checks did not complete cleanly, or the new release did not become healthy. The API stays stopped to avoid running code against an uncertain schema. Use the recorded backup reference for controlled recovery.' >&2
  fi
  rm -f -- "$next_env"
  rm -rf -- "$verify_dir"
}
trap handle_error ERR

migration_attempted=1
"${next_compose[@]}" --profile operations run --rm operations server/migrate.js
"${next_compose[@]}" --profile operations run --rm operations scripts/postgres-role-check.js
mv -f "$next_env" /etc/slink/release.env
compose=(docker compose --env-file /etc/slink/release.env --file /opt/slink/compose.yaml)
"${compose[@]}" up -d --no-deps api
api_id="$("${compose[@]}" ps -q api)"
for attempt in $(seq 1 45); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$api_id" 2>/dev/null || true)"
  if [ "$status" = healthy ]; then break; fi
  if [ "$attempt" -eq 45 ]; then
    echo 'Updated Slink API did not become healthy. Keep the recorded backup reference for recovery.' >&2
    false
  fi
  sleep 2
done
trap - EXIT ERR
rm -rf -- "$verify_dir"
echo "Slink release $release is running. Pre-migration backup: $backup_reference"
