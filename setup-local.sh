#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-local.sh
# One-shot helper that prepares the prerequisites for running the multinode
# stack locally (nginx + two app instances + postgres primary/replica).
#
# Run once before your first `docker compose -f docker-compose-multinode.yml up`.
# Safe to re-run — existing files are never overwritten.
#
# Requires: bash, openssl, docker (with compose plugin)
# On Windows: run inside WSL or Git Bash.
# ---------------------------------------------------------------------------
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }

echo "=================================================="
echo "  TL Finance Core - Local Setup"
echo "=================================================="
echo

# ---------------------------------------------------------------------------
# 1. .env file
# ---------------------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env

  # Generate cryptographically random local secrets.
  if command -v openssl &>/dev/null; then
    SECRET=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 18)
    REPLICATION_PASSWORD=$(openssl rand -hex 18)
    REDIS_PASSWORD=$(openssl rand -hex 18)
    PGADMIN_PASSWORD=$(openssl rand -hex 18)
    # BSD sed (macOS) needs an extension arg; GNU sed does not
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i "s/^APP_SECRET=change-me/APP_SECRET=${SECRET}/" .env
      sed -i "s/^DB_PASSWORD=budget/DB_PASSWORD=${DB_PASSWORD}/" .env
      sed -i "s/^REPLICATION_PASSWORD=replicator_password/REPLICATION_PASSWORD=${REPLICATION_PASSWORD}/" .env
      sed -i "s/^REDIS_PASSWORD=redis_password/REDIS_PASSWORD=${REDIS_PASSWORD}/" .env
      sed -i "s/^PGADMIN_PASSWORD=changeme/PGADMIN_PASSWORD=${PGADMIN_PASSWORD}/" .env
    else
      sed -i '' "s/^APP_SECRET=change-me/APP_SECRET=${SECRET}/" .env
      sed -i '' "s/^DB_PASSWORD=budget/DB_PASSWORD=${DB_PASSWORD}/" .env
      sed -i '' "s/^REPLICATION_PASSWORD=replicator_password/REPLICATION_PASSWORD=${REPLICATION_PASSWORD}/" .env
      sed -i '' "s/^REDIS_PASSWORD=redis_password/REDIS_PASSWORD=${REDIS_PASSWORD}/" .env
      sed -i '' "s/^PGADMIN_PASSWORD=changeme/PGADMIN_PASSWORD=${PGADMIN_PASSWORD}/" .env
    fi
    ok ".env created with random local secrets"
  else
    warn ".env created — openssl not found, replace all placeholder secrets manually"
  fi
else
  ok ".env already exists (not overwritten)"
fi

# Warn if APP_SECRET is still the placeholder
if grep -q "^APP_SECRET=change-me" .env 2>/dev/null; then
  warn "APP_SECRET is still 'change-me' — replace it before exposing this app"
fi

# ---------------------------------------------------------------------------
# 2. Self-signed SSL certificate
# ---------------------------------------------------------------------------
if [ ! -f ssl/cert.pem ] || [ ! -f ssl/key.pem ]; then
  mkdir -p ssl
  if ! command -v openssl &>/dev/null; then
    err "openssl is required to generate SSL certificates. Install it and re-run."
  fi

  # Write a temporary openssl config that includes SubjectAltName for localhost.
  # This approach works with both OpenSSL and LibreSSL (macOS default).
  TMP_CNF=$(mktemp /tmp/tlfc-ssl-XXXXXX.cnf)
  cat > "$TMP_CNF" <<'CNF'
[req]
default_bits       = 4096
prompt             = no
default_md         = sha256
req_extensions     = req_ext
distinguished_name = dn

[dn]
C  = CH
ST = Zurich
L  = Zurich
O  = TL Finance Core
CN = localhost

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
CNF

  openssl req -x509 -newkey rsa:4096 \
    -keyout ssl/key.pem \
    -out    ssl/cert.pem \
    -days   365 \
    -nodes  \
    -config "$TMP_CNF" \
    -extensions req_ext \
    2>/dev/null

  rm -f "$TMP_CNF"
  chmod 600 ssl/key.pem
  ok "Self-signed SSL certificate generated → ssl/cert.pem, ssl/key.pem"
  warn "Your browser will show a certificate warning — this is expected for local self-signed certs."
else
  ok "SSL certificates already exist (not overwritten)"
fi

# ---------------------------------------------------------------------------
# 3. Postgres init scripts — make executable
# ---------------------------------------------------------------------------
chmod +x postgres/init-primary.sh postgres/init-replica.sh 2>/dev/null && \
  ok "postgres/ init scripts marked executable" || \
  warn "Could not chmod postgres/init-*.sh (may be on a Windows FS — Docker will still read them)"

# ---------------------------------------------------------------------------
# Done — print next steps
# ---------------------------------------------------------------------------
echo
echo "=================================================="
echo "  Prerequisites ready. Next steps:"
echo "=================================================="
echo
echo "  1. Build and start all services:"
echo "     docker compose -f docker-compose-multinode.yml up -d --build"
echo
echo "  2. Wait ~30 s for the DB to initialise, then run migrations + seed:"
echo "     docker compose -f docker-compose-multinode.yml exec app-1 \\"
echo "       npx prisma migrate deploy"
echo "     docker compose -f docker-compose-multinode.yml exec app-1 \\"
echo "       npx prisma db seed"
echo
echo "  3. Open the app:"
echo "     https://localhost        (accept the self-signed cert warning)"
echo
echo "  Optional PgAdmin:"
echo "     docker compose -f docker-compose-multinode.yml --profile tools up -d pgadmin"
echo "     http://127.0.0.1:${PGADMIN_PORT:-5050}   (email/password from .env)"
echo
echo "  Check service health:"
echo "     docker compose -f docker-compose-multinode.yml ps"
echo "     curl -k https://localhost/api/health"
echo
