#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for file in js/core/*.js js/adapters/*.js js/ui/*.js js/features/*.js js/*.js sw.js; do
  node --check "$file" >/dev/null
done
python3 -m json.tool manifest.webmanifest >/dev/null
python3 tests/static-check.py
node tests/module-load.test.js
node tests/firebase-rules.test.js
node tests/tarot-daily.test.js
node tests/offline-game-cache.test.js
node tests/chat-modules.test.js
node tests/legacy-chat-import.test.js
node tests/voice-edge.test.js
node tests/unread.test.js
node tests/mobile-immersive.test.js
node tests/realtime-local.test.js
node tests/room-management.test.js
node tests/window-mode.test.js
node tests/audit-stability.test.js
echo ALL_AVAILABLE_TESTS_OK
