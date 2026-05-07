#!/bin/sh
set -eu

SSL_DIR="/etc/nginx/ssl"
CERT_FILE="${SSL_DIR}/cert.pem"
KEY_FILE="${SSL_DIR}/key.pem"

mkdir -p "${SSL_DIR}"

if [ ! -s "${CERT_FILE}" ] || [ ! -s "${KEY_FILE}" ]; then
  echo "Generating self-signed TLS certificate for localhost"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "${KEY_FILE}" \
    -out "${CERT_FILE}" \
    -days 3650 \
    -subj "/CN=localhost"
fi

exec nginx -g "daemon off;"
