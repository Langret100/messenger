#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for file in js/core/*.js js/adapters/*.js js/ui/*.js js/features/*.js js/*.js sw.js; do
  node --check "$file" >/dev/null
done
python3 -m json.tool manifest.webmanifest >/dev/null
python3 tests/static-check.py
for test_file in tests/*.test.js; do
  node "$test_file"
done
node -e 'const fs=require("fs"),vm=require("vm");for(const f of ["docs/apps-script/Code.gs","docs/apps-script/coin-shopping-extension.gs"])new vm.Script(fs.readFileSync(f,"utf8"),{filename:f})'
echo ALL_AVAILABLE_TESTS_OK

