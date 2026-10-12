#!/bin/sh
set -eu

# callphone-outbound-v1.sql is a consolidated baseline that already contains
# the v2, v7 and v8 column/table changes. Reapplying those ALTER statements
# would fail on a clean install. The remaining versioned migrations are safe
# against that baseline: table migrations use CREATE TABLE IF NOT EXISTS, and
# menu migrations guard their inserts.
for version in $(seq 3 58); do
  case "$version" in
    7|8) continue ;;
  esac

  for migration in /callphone-migrations/callphone-v"$version"-*.sql; do
    [ -f "$migration" ] || continue
    echo "Applying Call Phone migration $(basename "$migration")"
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE" < "$migration"
  done
done
