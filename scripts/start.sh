#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "${ROOT_DIR}"

if [ ! -f .env ]; then
  echo "ERROR: .env file is missing"
  exit 1
fi

echo "Starting infrastructure services"
docker compose up -d mysql redis nacos

wait_for_health() {
  service_name="$1"
  deadline="$(($(date +%s) + 300))"
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "cloudflow-${service_name}" 2>/dev/null || true)"
    if [ "${status}" = "healthy" ]; then
      return 0
    fi
    sleep 5
  done
  echo "ERROR: ${service_name} did not become healthy within 300 seconds"
  docker compose logs "${service_name}"
  exit 1
}

wait_for_health mysql
wait_for_health redis
wait_for_health nacos

echo "Starting application services"
docker compose up -d gateway auth workflow oa hr

echo "Starting frontend and monitoring"
docker compose up -d frontend prometheus grafana

echo "CloudFlow Pro startup completed"
