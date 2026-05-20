#!/bin/sh
set -eu

if [ -z "${PROMETHEUS_SCRAPE_PASSWORD:-}" ]; then
  echo "PROMETHEUS_SCRAPE_PASSWORD is required" >&2
  exit 1
fi

printf '%s' "${PROMETHEUS_SCRAPE_PASSWORD}" > /etc/prometheus/scrape.password
chmod 600 /etc/prometheus/scrape.password

exec /bin/prometheus "$@"
