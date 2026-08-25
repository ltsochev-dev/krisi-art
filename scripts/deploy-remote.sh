#!/usr/bin/env bash
#
# Runs ON THE VPS. It is piped in over SSH by .github/workflows/deploy.yml,
# which prepends the variable assignments below — nothing is passed in argv,
# where the registry token would be visible to every user in `ps`.
#
# Expects, in $DEPLOY_DIR on the server:
#   docker-compose.yml   with `image: ${IMAGE}:${IMAGE_TAG}` for $SERVICE
#   .env                 the app's environment (see .env.example), owned by you
#   .env.deploy          written by this script; holds only IMAGE/IMAGE_TAG
#
# `--env-file .env.deploy` feeds compose's ${...} substitution only. The app's
# own environment still comes from the `env_file:` entry inside the compose
# file, so the secrets file is never rewritten by a deploy.
set -euo pipefail

: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
: "${SERVICE:?SERVICE is required}"
: "${IMAGE:?IMAGE is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${GHCR_USER:?GHCR_USER is required}"
: "${GHCR_TOKEN:?GHCR_TOKEN is required}"

HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}

cd "$DEPLOY_DIR"

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose --env-file .env.deploy "$@" </dev/null; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose --env-file .env.deploy "$@" </dev/null; }
else
  echo "docker compose is not installed on this host" >&2
  exit 1
fi

# Short-lived: it is this workflow run's GITHUB_TOKEN and dies with the job.
printf '%s\n' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

previous=$( [ -f .env.deploy ] && sed -n 's/^IMAGE_TAG=//p' .env.deploy || true )

umask 077
printf 'IMAGE=%s\nIMAGE_TAG=%s\n' "$IMAGE" "$IMAGE_TAG" > .env.deploy.tmp
mv .env.deploy.tmp .env.deploy

echo "==> Pulling $IMAGE:$IMAGE_TAG"
compose pull "$SERVICE"

echo "==> Restarting $SERVICE"
compose up -d --remove-orphans

# Migrations run on boot inside the container, so "started" is not "ready".
# The compose healthcheck hits /api/access, which needs a migrated database.
container=$(compose ps -q "$SERVICE")
if [ -z "$container" ]; then
  echo "no container for service $SERVICE" >&2
  exit 1
fi

echo "==> Waiting for health (up to ${HEALTH_TIMEOUT}s)"
deadline=$((SECONDS + HEALTH_TIMEOUT))
while :; do
  status=$(docker inspect -f \
    '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}{{ .State.Status }}{{ end }}' \
    "$container")

  case "$status" in
    healthy | running)
      echo "==> $SERVICE is $status"
      break
      ;;
    unhealthy | exited | dead)
      echo "==> $SERVICE is $status — deploy failed" >&2
      compose logs --tail 100 "$SERVICE" >&2 || true
      if [ -n "$previous" ] && [ "$previous" != "$IMAGE_TAG" ]; then
        echo "==> Roll back with: IMAGE_TAG=$previous docker compose --env-file .env.deploy up -d" >&2
      fi
      exit 1
      ;;
  esac

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "==> Timed out waiting for health (last status: $status)" >&2
    compose logs --tail 100 "$SERVICE" >&2 || true
    exit 1
  fi

  sleep 3
done

compose ps

# Dangling layers only — previous tagged images stay pullable for a rollback.
docker image prune -f </dev/null >/dev/null 2>&1 || true

echo "==> Deployed $IMAGE:$IMAGE_TAG"
