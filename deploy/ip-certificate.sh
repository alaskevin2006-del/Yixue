#!/usr/bin/env bash
# Run on the inspected Linux deployment host, from any directory.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
root_dir="$(pwd -P)"
certbot_image='certbot/certbot:v5.4.0@sha256:c23159d30afdd9c97960578aa4654f5901de6cae394958f894074dedd55e599d'
mode="${1:-}"
if [[ "$mode" != 'issue' && "$mode" != 'renew' ]]; then
  echo 'Usage: bash deploy/ip-certificate.sh issue PUBLIC_IPV4 [--staging] | renew [--dry-run]' >&2
  exit 2
fi
mkdir -p deploy-data/certificates deploy-data/acme
exec 9>deploy-data/ip-certificate.lock
flock -n 9 || exit 0
mounts=(-v "$root_dir/deploy-data/certificates:/etc/letsencrypt" -v "$root_dir/deploy-data/acme:/var/www/acme")
if [[ "$mode" == 'issue' ]]; then
  address="${2:-}"
  [[ "$address" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo 'A public IPv4 address is required.' >&2; exit 2; }
  options=()
  if [[ "${3:-}" == '--staging' ]]; then
    # Keep staging certificates separate; never replace the production certificate.
    mkdir -p deploy-data/certificates-staging
    mounts=(-v "$root_dir/deploy-data/certificates-staging:/etc/letsencrypt")
    options+=(--staging)
  elif [[ -n "${3:-}" ]]; then
    echo 'Unknown option.' >&2; exit 2
  fi
  # Standalone issuance requires port80 free; do not stop an existing web service automatically.
  docker run --rm -p 80:80 "${mounts[@]}" "$certbot_image" certonly \
    --standalone --preferred-profile shortlived --ip-address "$address" \
    --cert-name yixue-ip --non-interactive --agree-tos --register-unsafely-without-email "${options[@]}"
else
  options=()
  if [[ "${2:-}" == '--dry-run' ]]; then options+=(--dry-run --no-random-sleep-on-renew); elif [[ -n "${2:-}" ]]; then echo 'Unknown option.' >&2; exit 2; fi
  docker run --rm "${mounts[@]}" "$certbot_image" renew --cert-name yixue-ip \
    --webroot --webroot-path /var/www/acme --non-interactive "${options[@]}"
  if [[ "${2:-}" != '--dry-run' ]]; then
    docker compose -f compose.yaml -f compose.ip.yaml exec -T web caddy reload --force --config /etc/caddy/Caddyfile
  fi
fi
