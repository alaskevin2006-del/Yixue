#!/usr/bin/env bash
# Run as root after uploading sources and building the selected image.
# Deployer separately merges and validates the Caddy routing snippet.
set -euo pipefail
umask 077
BASE=${YIXUE_BASE_DIR:-/opt/yixue}
cd "$BASE"
test -f .env
test -f deploy/compose.test.yaml
if [ ! -f compose.test.yaml ]; then cp deploy/compose.test.yaml compose.test.yaml; fi
mkdir -p deploy-data/test/uploads operations
chown -R 1000:1000 deploy-data/test
chmod 700 deploy-data/test operations
COMPOSE=(docker compose -f compose.yaml -f compose.ip.yaml -f compose.preview.yaml -f compose.test.yaml)
# Inherit original admin credentials through env_file; never print or reset them.
"${COMPOSE[@]}" run --rm --no-deps test node scripts/seed-test-user.mjs
"${COMPOSE[@]}" up -d --no-deps --no-build test
for job in check backup; do
  cat > "/etc/systemd/system/yixue-$job.service" <<UNIT
[Unit]
Description=Yixue $job
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
Environment=YIXUE_BASE_DIR=$BASE
ExecStart=/bin/bash $BASE/deploy/operations.sh $job
UNIT
  if [ "$job" = check ]; then schedule=$'OnBootSec=3min\nOnUnitActiveSec=5min'; else schedule='OnCalendar=*-*-* 04:15:00'; fi
  cat > "/etc/systemd/system/yixue-$job.timer" <<UNIT
[Unit]
Description=Yixue scheduled $job
[Timer]
$schedule
Persistent=true
[Install]
WantedBy=timers.target
UNIT
done
systemctl daemon-reload
systemctl enable --now yixue-check.timer yixue-backup.timer
systemctl start yixue-check.service
systemctl list-timers yixue-check.timer yixue-backup.timer --no-pager
printf '%s\n' 'Private test credential receipt: deploy-data/test/operations/test-account.json'
