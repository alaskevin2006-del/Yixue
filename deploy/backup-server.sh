#!/usr/bin/env bash
# Consistent offline SQLite and upload backup; always restart the app on failure.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
root_dir="$(pwd -P)"
umask 077
mkdir -p deploy-data/backups
exec 9>deploy-data/backup.lock
flock -n 9 || exit 0
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
compose=(docker compose -f compose.yaml -f compose.ip.yaml)
image="$("${compose[@]}" images -q app)"
[[ -n "$image" ]] || { echo 'Application image missing' >&2; exit 1; }
trap '"${compose[@]}" start app' EXIT
"${compose[@]}" stop app
# SQLite may create WAL/SHM sidecars even for a read-only connection.
docker run --rm --user 0:0 -v "$root_dir/deploy-data/app:/source" -v "$root_dir/deploy-data/backups:/backups" "$image" node scripts/backup.mjs backup /source "/backups/$stamp" --offline
"${compose[@]}" start app
trap - EXIT
tar -czf "deploy-data/backups/$stamp.tar.gz.partial" -C deploy-data/backups "$stamp"
mv "deploy-data/backups/$stamp.tar.gz.partial" "deploy-data/backups/$stamp.tar.gz"
(cd deploy-data/backups && sha256sum "$stamp.tar.gz") > "deploy-data/backups/$stamp.tar.gz.sha256.partial"
mv "deploy-data/backups/$stamp.tar.gz.sha256.partial" "deploy-data/backups/$stamp.tar.gz.sha256"
echo "Backup complete: $stamp"
