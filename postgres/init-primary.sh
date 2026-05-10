#!/bin/sh
# ---------------------------------------------------------------------------
# postgres/init-primary.sh
# Runs once inside the primary container on first database initialisation
# (placed in /docker-entrypoint-initdb.d/ by docker-compose).
#
# Creates the streaming-replication user and opens pg_hba.conf so the
# replica can connect. The REPLICATION_PASSWORD env var is injected by
# docker-compose; falls back to a default for local setups.
# ---------------------------------------------------------------------------
set -e

REPL_PASS="${REPLICATION_PASSWORD:-replicator_password}"

echo "[init-primary] Creating replication user..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER IF NOT EXISTS replicator
    WITH REPLICATION
    ENCRYPTED PASSWORD '${REPL_PASS}';
EOSQL

echo "[init-primary] Adding pg_hba entry for replication..."
# Allow the replicator user to connect for replication from any host on the
# Docker bridge network using md5 (password) authentication.
echo "host  replication  replicator  all  md5" >> "$PGDATA/pg_hba.conf"

echo "[init-primary] Reloading pg_hba.conf..."
pg_ctl reload -D "$PGDATA"

echo "[init-primary] Done."
