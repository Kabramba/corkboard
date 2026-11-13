#!/usr/bin/env bash
# Starts the *installed* app off-screen in a throwaway home folder and checks that it
# created and saved its first board. Usage: scripts/smoke.sh [path-to-binary]
set -euo pipefail
BIN=${1:-/opt/Corkboard/corkboard}
export HOME; HOME=$(mktemp -d)
export CORK_TEST=1
BOARD="$HOME/Corkboards/My Corkboard"

test -x "$BIN" || { echo "FAIL: $BIN is not installed"; exit 1; }
test -f /usr/share/applications/corkboard.desktop || { echo "FAIL: no applications-menu entry"; exit 1; }
ls /usr/share/icons/hicolor/*/apps/corkboard.png >/dev/null || { echo "FAIL: no icon"; exit 1; }

xvfb-run -a "$BIN" --no-sandbox >"$HOME/app.log" 2>&1 &
for _ in $(seq 1 45); do [ -f "$BOARD/board.json" ] && break; sleep 1; done
sleep 2
pkill -f "$BIN" || true

if [ ! -f "$BOARD/board.json" ]; then echo "FAIL: the app never saved a board"; tail -30 "$HOME/app.log"; exit 1; fi
node -e '
  const fs = require("fs"), dir = process.argv[1];
  const n = JSON.parse(fs.readFileSync(dir + "/board.json", "utf8")).S.items.length;
  const ok = n === 5 && fs.existsSync(dir + "/board.json.bak") && fs.readdirSync(dir + "/backups").length >= 0;
  console.log(ok ? `ok: installed app started and saved a board with ${n} pieces` : `FAIL: unexpected board (${n} pieces)`);
  process.exit(ok ? 0 : 1);
' "$BOARD"
