#!/bin/sh
set -eu

WITH_UI=0
if [ "$#" -gt 1 ]; then
  echo 'Usage: ./script/callphone-local-up.sh [--with-ui]' >&2
  exit 2
fi
case "${1:-}" in
  "") ;;
  --with-ui) WITH_UI=1 ;;
  --help|-h)
    echo 'Usage: ./script/callphone-local-up.sh [--with-ui]'
    echo '  --with-ui  Start the Vue admin after MySQL, Redis, and Yudao are healthy (default port 5175; override with CALLPHONE_UI_PORT).'
    exit 0
    ;;
  *)
    echo "Unknown option: $1" >&2
    echo 'Usage: ./script/callphone-local-up.sh [--with-ui]' >&2
    exit 2
    ;;
esac

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ../ai-service/.env.local ]; then
  echo 'Configure apps/ai-service/.env.local and its model API key before starting AI features.' >&2
  exit 1
fi
compose() {
  set -- -f ../ai-service/compose.ai.yml -f ../ai-service/compose.agent.yml "$@"
  if [ -f compose.app-update.yml ]; then
    set -- -f compose.app-update.yml "$@"
  fi
  if [ -n "${CALLPHONE_TAILSCALE_IP:-}" ]; then
    set -- -f compose.tailscale.yml "$@"
  fi
  docker compose -f compose.local.yml --profile ai --profile agent "$@"
}

if [ ! -f .env.local ]; then
  umask 077
  printf 'CALLPHONE_PII_ENCRYPTION_KEY=%s\nCALLPHONE_RECORDING_STORAGE_PATH=/yudao-server/data/callphone/recordings\nCALLPHONE_CORE_ALLOWED_HOSTS=\n' "$(openssl rand -base64 32)" > .env.local
  chmod 600 .env.local
  echo 'Created a local-only encryption key in .env.local. Back it up securely; losing it makes encrypted customer fields and recordings unreadable.'
fi
python3 ../../scripts/configure-agent-local.py --require-model

docker_ready() {
  docker info >/dev/null 2>&1 &
  docker_pid=$!
  elapsed=0
  while kill -0 "$docker_pid" 2>/dev/null; do
    if [ "$elapsed" -ge 8 ]; then
      kill "$docker_pid" 2>/dev/null || true
      wait "$docker_pid" 2>/dev/null || true
      return 2
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "$docker_pid"
}

if ! docker_ready; then
  echo 'Starting Docker Desktop...'
  docker desktop start --detach --timeout 15 >/dev/null 2>&1 || true
  attempt=0
  until docker_ready; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 20 ]; then
      echo 'Docker Desktop did not respond to docker info. Restart Docker Desktop manually, then run this script again. This script does not reset or remove the database volume.' >&2
      exit 1
    fi
    sleep 3
  done
fi

echo 'Starting MySQL and Redis; waiting for their health checks...'
compose up -d --wait --wait-timeout 240 mysql redis

echo 'Applying idempotent Call Phone v44 through v59 migrations...'
for migration in "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v44-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v45-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v46-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v47-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v48-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v49-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v50-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v51-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v52-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v53-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v54-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v55-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v56-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v57-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v58-*.sql \
                 "$ROOT_DIR"/yudao-module-callphone/src/main/resources/sql/mysql/callphone-v59-*.sql; do
  [ -f "$migration" ] || continue
  compose exec -T mysql sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE"' \
    < "$migration"
done

echo 'Building and starting the Yudao API; waiting for MySQL and Redis health checks...'
compose up -d --build --wait --wait-timeout 240

echo 'MySQL and Redis are healthy. Waiting for the Yudao API...'
attempt=0
until curl --fail --silent --connect-timeout 1 --max-time 2 http://127.0.0.1:48080/actuator/health \
  | grep --extended-regexp --quiet '"status"[[:space:]]*:[[:space:]]*"UP"'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo 'The database and cache are healthy, but the API did not become healthy within 120 seconds.' >&2
    compose ps
    echo 'Inspect startup logs with: docker compose -f compose.local.yml logs --tail=100 server' >&2
    exit 1
  fi
  sleep 1
done

echo 'Local services are ready:'
echo '  API:   http://127.0.0.1:48080'
echo '  AI chat and Agent task services: running on the private Compose network'
echo '  MySQL: 127.0.0.1:13306'
echo '  Redis: 127.0.0.1:16379'

if [ "$WITH_UI" -eq 1 ]; then
  UI_DIR="$ROOT_DIR/yudao-ui-admin-vue3"
  if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
    echo 'Node.js 20.19+ and pnpm are required to start the Vue admin.' >&2
    exit 1
  fi
  if [ ! -x "$UI_DIR/node_modules/.bin/vite" ]; then
    echo 'Vue dependencies are not installed. Install them once in yudao-ui-admin-vue3, then retry.' >&2
    exit 1
  fi
  NODE_VERSION="$(node -p 'process.versions.node')"
  NODE_MAJOR="${NODE_VERSION%%.*}"
  NODE_REST="${NODE_VERSION#*.}"
  NODE_MINOR="${NODE_REST%%.*}"
  if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
    echo "Node.js $NODE_VERSION is too old; use 20.19+ (22 LTS or 24 recommended)." >&2
    exit 1
  fi
  UI_PORT="${CALLPHONE_UI_PORT:-5175}"
  echo "Starting Vue admin at http://127.0.0.1:$UI_PORT (Ctrl-C stops the UI; backend containers keep running)..."
  cd "$UI_DIR"
  exec pnpm dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort
fi

echo 'Start the Vue admin separately with: cd yudao-ui-admin-vue3 && pnpm dev -- --host 127.0.0.1 --port 5175 --strictPort'
