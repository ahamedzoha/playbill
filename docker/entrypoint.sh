#!/bin/sh
# Starts as root only long enough to make /config writable for PUID:PGID, then drops privileges.
set -e

CONFIG_DIR="${CONFIG_DIR:-/config}"

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  mkdir -p "$CONFIG_DIR"
  if [ "$(stat -c '%u:%g' "$CONFIG_DIR")" != "$PUID:$PGID" ]; then
    echo "playbill: giving $CONFIG_DIR to $PUID:$PGID"
    chown -R "$PUID:$PGID" "$CONFIG_DIR"
  fi
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups node /app/supervisor.mjs
fi

exec node /app/supervisor.mjs
