#!/bin/zsh
# Nightly backup of the millionmessages.us count to the Mac mini.
# The count is the only state the site has, so this one number IS the backup.
#
# Writes:  backups/count-YYYY-MM-DD.json   (one file per day, kept forever; they're tiny)
#          backups/latest.json             (always the most recent)
#          backups/history.csv             (date,count — one line per run)
#
# Install (from the project folder):
#   chmod +x scripts/backup.sh
#   cp scripts/us.millionmessages.backup.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/us.millionmessages.backup.plist
# Test once by hand:  scripts/backup.sh

set -euo pipefail
SITE="https://millionmessages.us"
DIR="${0:a:h}/../backups"
mkdir -p "$DIR"
TODAY=$(date +%Y-%m-%d)

JSON=$(curl -fsS --max-time 20 "$SITE/api/count")
COUNT=$(echo "$JSON" | /usr/bin/python3 -c 'import sys,json; print(json.load(sys.stdin)["count"])')

echo "$JSON" > "$DIR/count-$TODAY.json"
echo "$JSON" > "$DIR/latest.json"
[[ -f "$DIR/history.csv" ]] || echo "date,count" > "$DIR/history.csv"
echo "$TODAY,$COUNT" >> "$DIR/history.csv"
echo "$(date '+%Y-%m-%d %H:%M') backed up count=$COUNT"
