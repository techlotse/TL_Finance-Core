#!/bin/sh
set -eu

if [ "${NODE_ENV:-}" = "production" ]; then
  case "${APP_SECRET:-}" in
    ""|"change-me"|"change-me-replace-in-env")
      echo "APP_SECRET must be set to a non-placeholder value in production." >&2
      exit 1
      ;;
  esac

  if [ "${#APP_SECRET}" -lt 32 ]; then
    echo "APP_SECRET must be at least 32 characters in production." >&2
    exit 1
  fi

  case "${DATABASE_URL:-}" in
    "")
      echo "DATABASE_URL must be set in production." >&2
      exit 1
      ;;
    *"budget:budget@"*)
      echo "DATABASE_URL still contains the default budget:budget credentials." >&2
      exit 1
      ;;
  esac
fi

exec "$@"
