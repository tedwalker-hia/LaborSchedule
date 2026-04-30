#!/usr/bin/env bash
# Migrations must run at container start time (entrypoint), not during image build.
# Baking in `prisma migrate deploy` means migrations run as root during build
# and the image carries DB connection state — both are wrong.
set -euo pipefail

DOCKERFILE="${1:-Dockerfile}"

if [[ ! -f "$DOCKERFILE" ]]; then
  echo "ERROR: '$DOCKERFILE' not found." >&2
  exit 1
fi

if grep -qE '^\s*(RUN|CMD|ENTRYPOINT).*prisma migrate deploy' "$DOCKERFILE"; then
  echo "ERROR: '$DOCKERFILE' bakes in 'prisma migrate deploy'." >&2
  echo "Move migrations to a container entrypoint script that runs at startup." >&2
  exit 1
fi

echo "OK: '$DOCKERFILE' does not bake in 'prisma migrate deploy'."
