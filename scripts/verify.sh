#!/bin/bash
# Every check before a release: tsc (strict, nothing unused), the layer rule, the engine's static
# validation, and the tests.
#
# The engine writes its type declarations when a skill loads, in a per-session temp folder, so this finds
# the newest one. Override with CLAUDE_CODE_TYPES=<path to claude-code.d.ts> and TSC=<tsc binary>.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)

types=${CLAUDE_CODE_TYPES:-$(ls -t /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts 2>/dev/null | head -1)}
tsc=${TSC:-$(command -v tsc || true)}
[[ -f $types ]] || { echo "claude-code.d.ts not found; load the plugin-authoring skill or set CLAUDE_CODE_TYPES"; exit 1; }
[[ -x $tsc ]] || { echo "tsc not found; set TSC"; exit 1; }

config=$(mktemp -t spotify-control-tsconfig)
trap 'rm -f "$config"' EXIT
cat >"$config" <<JSON
{ "compilerOptions": { "target": "es2023", "lib": ["es2023"], "types": [], "module": "esnext", "moduleResolution": "bundler",
  "strict": true, "noUncheckedIndexedAccess": true, "noUnusedLocals": true, "noUnusedParameters": true, "noEmit": true, "skipLibCheck": true,
  "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" },
  "files": ["$types"], "include": ["$ROOT/hooks", "$ROOT/types", "$ROOT/tests"] }
JSON

"$tsc" -p "$config" || { echo "TSC FAILED"; exit 1; }
echo "tsc ok"
"$ROOT/scripts/check-layers.sh" || exit 1
claude plugin validate "$ROOT" 2>&1 | grep -E "✔|✘|rror" | cut -c1-200
claude plugin test "$ROOT" 2>&1 | grep -E "^ *[0-9]+ (pass|fail)|\(fail\)|rror"
