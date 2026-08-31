#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for file in js/core/*.js js/adapters/*.js js/ui/*.js js/ai/*.js js/features/*.js js/*.js sw.js; do
  node --check "$file" >/dev/null
done

python3 -m json.tool manifest.webmanifest >/dev/null
python3 tests/static-check.py

for test_file in tests/*.test.js; do
  node "$test_file"
done

# v91 Apps Script 문법 검사:
# MOA_CHAT.gs / MOA_LEARNING.gs는 v91에서 제거되었으므로 다시 읽지 않습니다.
node -e 'const fs=require("fs"),vm=require("vm");for(const f of ["docs/apps-script/Code.gs","docs/apps-script/coin-shopping-extension.gs","docs/apps-script/MOA_AI.gs"])new vm.Script(fs.readFileSync(f,"utf8"),{filename:f})'

echo ALL_AVAILABLE_TESTS_OK
