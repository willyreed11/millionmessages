#!/bin/zsh
# Restore the count from a backup (or set it to any value) — admin only.
# Usage:  ADMIN_SECRET=xxxx scripts/restore.sh 123456
#    or:  ADMIN_SECRET=xxxx scripts/restore.sh            (uses backups/latest.json)
set -euo pipefail
SITE="https://millionmessages.us"
DIR="${0:a:h}/../backups"
if [[ -z "${ADMIN_SECRET:-}" ]]; then echo "Set ADMIN_SECRET in the environment first." >&2; exit 1; fi
if [[ $# -ge 1 ]]; then COUNT="$1"; else
  COUNT=$(/usr/bin/python3 -c 'import json; print(json.load(open("'"$DIR"'/latest.json"))["count"])')
fi
echo "Setting count to $COUNT ..."
curl -fsS -X POST "$SITE/api/admin/set" \
  -H "authorization: Bearer $ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d "{\"count\": $COUNT}"
echo
