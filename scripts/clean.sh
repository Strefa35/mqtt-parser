#!/usr/bin/env sh
# Remove local build/runtime artifacts (see README "Cleaning build and runtime artifacts").
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

USE_RMI=0
USE_PRUNE=0

for arg in "$@"; do
  case "$arg" in
    --rmi)
      USE_RMI=1
      ;;
    --prune)
      USE_PRUNE=1
      ;;
    -h | --help)
      echo "Usage: $0 [--rmi] [--prune]"
      echo "  --rmi    Also run: docker compose down --rmi local"
      echo "  --prune  Also run: docker builder prune -f && docker system prune -f (global Docker cleanup)"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if [ "$USE_RMI" -eq 1 ]; then
  docker compose down --rmi local
else
  docker compose down
fi

rm -rf web/node_modules web/dist server/node_modules server/dist data

echo "Cleaned: node_modules, dist, data (repo root: $REPO_ROOT)"

if [ "$USE_PRUNE" -eq 1 ]; then
  echo "Running docker builder prune and docker system prune (all unused Docker data on this host)..."
  docker builder prune -f
  docker system prune -f
fi
