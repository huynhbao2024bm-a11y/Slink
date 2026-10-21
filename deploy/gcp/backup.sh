#!/bin/bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then exec sudo -- "$0" "$@"; fi
source /etc/slink/release.env
exec 9>/run/lock/slink-backup.lock
if ! flock -n 9; then
  echo 'Another Slink backup is already running.' >&2
  exit 1
fi
compose=(docker compose --env-file /etc/slink/release.env --file /opt/slink/compose.yaml)

output="$("${compose[@]}" --profile operations run --rm --no-deps operations scripts/postgres-backup.js create 2>&1)" || {
  printf '%s\n' "$output" >&2
  exit 1
}
printf '%s\n' "$output"
container_manifest="$(printf '%s\n' "$output" | sed -n 's/^Encrypted backup created: //p' | tail -n 1)"
manifest_name="$(basename "$container_manifest")"
if ! [[ "$manifest_name" =~ ^[A-Za-z0-9T._-]+\.slinkbackup\.manifest\.json$ ]]; then
  echo 'Backup runner did not return a valid manifest name.' >&2
  exit 1
fi
host_manifest="/var/lib/slink/backups/$manifest_name"
host_archive="${host_manifest%.manifest.json}"
test -s "$host_manifest" && test -s "$host_archive"

gcloud storage cp "$host_archive" "gs://${SLINK_BACKUP_BUCKET}/"
gcloud storage cp "$host_manifest" "gs://${SLINK_BACKUP_BUCKET}/"
verify_dir="/var/lib/slink/backups/.gcs-verify-$$"
install -d -o 1000 -g 1000 -m 0700 "$verify_dir"
trap 'rm -rf -- "$verify_dir"' EXIT
gcloud storage cp "gs://${SLINK_BACKUP_BUCKET}/${manifest_name}" "$verify_dir/$manifest_name"
archive_name="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["fileName"])' "$verify_dir/$manifest_name")"
if ! [[ "$archive_name" =~ ^[A-Za-z0-9T._-]+\.slinkbackup$ ]]; then
  echo 'Backup manifest names an unexpected archive file.' >&2
  exit 1
fi
gcloud storage cp "gs://${SLINK_BACKUP_BUCKET}/${archive_name}" "$verify_dir/$archive_name"
"${compose[@]}" --profile operations run --rm --no-deps \
  --volume "$verify_dir:/gcs-verify:ro" operations \
  scripts/postgres-backup.js verify "/gcs-verify/$manifest_name"
echo "Backup reference: gs://${SLINK_BACKUP_BUCKET}/${manifest_name}"
