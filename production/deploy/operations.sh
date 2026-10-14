#!/usr/bin/env bash
set -euo pipefail
umask 077
BASE=${YIXUE_BASE_DIR:-/opt/yixue}
cd "$BASE"
COMPOSE=(docker compose -f compose.yaml -f compose.ip.yaml -f compose.preview.yaml -f compose.test.yaml)
exec 9>"$BASE/.operations.lock"
flock -n 9 || exit 0
mkdir -p "$BASE/operations" "$BASE/backups/scheduled"
log_failure() { printf '{"at":"%s","event":"%s","service":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$2" >> "$BASE/operations/alerts.jsonl"; logger -t yixue-operations "$1 service=$2"; }
check() {
  local result=0
  for service in app test; do
    if ! "${COMPOSE[@]}" exec -T "$service" node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(8000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then log_failure HEALTH_FAILED "$service"; result=1; fi
    if ! "${COMPOSE[@]}" exec -T "$service" node scripts/operations.mjs check /data --write; then log_failure STORAGE_CHECK_FAILED "$service"; result=1; fi
  done
  return "$result"
}
backup_one() (
  local service=$1 stamp target source image stopped=0 available required
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$BASE/backups/scheduled/$service-$stamp"
  source="$BASE/deploy-data/$service"
  available=$(df -PB1 "$BASE/backups" | awk 'NR==2 {print $4}')
  required=$(( $(du -sb "$source" | cut -f1) * 2 + 536870912 ))
  if [ "$available" -lt "$required" ]; then log_failure BACKUP_DISK_LOW "$service"; exit 1; fi
  image=$("${COMPOSE[@]}" images -q "$service")
  test -n "$image"
  mkdir -m 700 "$target"
  trap 'if [ "$stopped" = 1 ]; then "${COMPOSE[@]}" start "$service"; fi' EXIT
  # Stop writer for the complete DB + WAL + upload snapshot.
  stopped=1
  "${COMPOSE[@]}" stop "$service"
  if ! docker run --rm --user root -v "$source:/source:ro" -v "$target:/backup" "$image" node --input-type=module -e "import {cp,rm} from 'node:fs/promises';import {createBackup} from './scripts/backup.mjs';await cp('/source','/backup/raw',{recursive:true});await createBackup({dataDir:'/backup/raw',outputDir:'/backup/snapshot',offline:true});await rm('/backup/raw',{recursive:true});"; then
    log_failure BACKUP_FAILED "$service"; exit 1
  fi
  "${COMPOSE[@]}" start "$service"; stopped=0
  # Restore to the disposable container writable layer; --rm removes only that container.
  if ! docker run --rm --user root --mount "type=bind,source=$target/snapshot,target=/backup,readonly" "$image" node scripts/backup.mjs restore /backup /tmp/yixue-restore-drill --offline; then log_failure RESTORE_DRILL_FAILED "$service"; exit 1; fi
  printf '{"at":"%s","service":"%s","backup":"%s","restoreDrill":true}\n' "$(date -u +%FT%TZ)" "$service" "$target/snapshot" >> "$BASE/operations/backups.jsonl"
)
case "${1:-check}" in
  check) check;;
  backup) backup_one app; backup_one test; check;;
  *) echo 'Usage: operations.sh check|backup' >&2; exit 1;;
esac
