#!/usr/bin/env bash
# Pulls the Playbill image your compose file points at and restarts the container only if the
# image changed, then waits until /api/health reports the new revision.
#
# Optional. Install with the systemd timer next to this file (see README.md in this folder).
# Pin `image:` to a sha-<commit> tag in compose to roll back; the timer then leaves it alone.
set -euo pipefail

COMPOSE_DIR="${PLAYBILL_COMPOSE_DIR:-/opt/playbill}"
SERVICE="${PLAYBILL_SERVICE:-playbill}"
HEALTH_URL="${PLAYBILL_HEALTH_URL:-http://127.0.0.1:5056/api/health}"

cd "$COMPOSE_DIR"
container=$(docker compose ps -q "$SERVICE" 2>/dev/null || true)
before=$([ -n "$container" ] && docker inspect "$container" --format '{{.Image}}' || echo none)

docker compose pull --quiet "$SERVICE"
docker compose up -d "$SERVICE"

container=$(docker compose ps -q "$SERVICE")
after=$(docker inspect "$container" --format '{{.Image}}')
[ "$before" = "$after" ] && exit 0

rev=$(docker inspect "$container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
echo "playbill: new image, revision ${rev:-unknown}; waiting for it to report healthy"
for _ in $(seq 1 45); do
  if body=$(curl -fsS "$HEALTH_URL" 2>/dev/null) && grep -q "\"revision\":\"$rev\"" <<<"$body"; then
    echo "playbill: healthy at $rev"
    # Remove the previous image only; never touch other images on the host.
    [ "$before" != none ] && docker image rm "$before" >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 4
done
echo "playbill: revision $rev did not become healthy within 3 minutes" >&2
docker compose logs --tail 50 "$SERVICE" >&2 || true
exit 1
