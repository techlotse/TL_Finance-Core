#!/bin/sh
# ---------------------------------------------------------------------------
# postgres/init-replica.sh
# Entrypoint for the postgres-replica container. Runs as the `postgres` user.
#
# On first start: waits for the primary, runs pg_basebackup with -R which
# automatically writes standby.signal and primary_conninfo into the data
# directory (the correct PG12+ standby mechanism — recovery.conf is gone).
#
# On subsequent starts: data directory already exists, skips basebackup and
# just starts postgres in standby mode.
# ---------------------------------------------------------------------------
set -e

PGDATA=/var/lib/postgresql/data
PRIMARY_HOST="${POSTGRES_PRIMARY_HOST:-postgres-primary}"
REPL_USER="${REPLICATION_USER:-replicator}"
# PGPASSWORD must be exported so pg_basebackup picks it up automatically.
export PGPASSWORD="${REPLICATION_PASSWORD:-replicator_password}"

echo "[init-replica] Waiting for primary at ${PRIMARY_HOST}:5432 ..."
until pg_isready -h "$PRIMARY_HOST" -p 5432 -q; do
  sleep 2
done
echo "[init-replica] Primary is ready."

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[init-replica] Data directory empty — running pg_basebackup ..."
  pg_basebackup \
    -h "$PRIMARY_HOST" \
    -D "$PGDATA" \
    -U "$REPL_USER" \
    -v \
    -P \
    -R          # Writes standby.signal + primary_conninfo (PG12+ style)

  echo "[init-replica] pg_basebackup complete."
else
  echo "[init-replica] Data directory already populated — skipping basebackup."
fi

echo "[init-replica] Starting PostgreSQL in hot-standby mode ..."
exec postgres -D "$PGDATA" -c hot_standby=on
