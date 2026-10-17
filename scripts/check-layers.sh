#!/bin/bash
# Checks the dependency rule from docs/adr/001-mod-architecture.md: imports only point down.
# Run from anywhere; exits 1 and lists every import that breaks the rule.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1

# hooks/lib/format.ts -> lib, hooks/services/music.ts -> service, and so on.
layer_of() {
  case $1 in
    hooks/lib/*) echo lib ;;
    hooks/services/*) echo service ;;
    hooks/ui/*) echo ui ;;
    hooks/host) echo host ;;
    hooks/stored) echo stored ;;
    hooks/config) echo config ;;
    hooks/register) echo register ;;
    tests/*) echo test ;;
    types | types/*) echo types ;;
    claude-code) echo engine ;;
    claude-code/testing) echo testing ;;
    *) echo "unknown:$1" ;;
  esac
}

# Resolves ../x against the importing file's directory without touching the disk.
resolve() {
  local -a parts out=()
  local part
  IFS=/ read -ra parts <<<"$1/$2"
  for part in "${parts[@]}"; do
    case $part in
      '' | .) ;;
      ..) unset 'out[${#out[@]}-1]' ;;
      *) out+=("$part") ;;
    esac
  done
  (IFS=/; echo "${out[*]}")
}

allowed() { # importer layer, target layer
  case $1 in
    config) return 1 ;;
    lib) [[ $2 == lib || $2 == types || $2 == config ]] ;;
    host | stored) [[ $2 == lib || $2 == types || $2 == stored || $2 == engine ]] ;;
    service-base) [[ $2 == lib || $2 == types || $2 == config || $2 == host || $2 == service-base ]] ;;
    service) [[ $2 == lib || $2 == types || $2 == config || $2 == host || $2 == service-base ]] ;;
    ui) [[ $2 == lib || $2 == types || $2 == config || $2 == ui || $2 == engine ]] ;;
    test) [[ $2 != register ]] ;;
    register) return 0 ;;
    *) return 1 ;;
  esac
}

failures=0
while IFS= read -r file; do
  stem=${file%.*}
  from=$(layer_of "$stem")
  dir=$(dirname "$file")
  while IFS= read -r spec; do
    if [[ $spec == .* ]]; then target=$(resolve "$dir" "$spec"); else target=$spec; fi
    to=$(layer_of "$target")
    if [[ $to == unknown:* ]]; then
      echo "unknown import target: $file -> $spec"; failures=$((failures + 1)); continue
    fi
    [[ $to == testing && $from == test ]] && continue
    if ! allowed "$from" "$to"; then
      echo "layer violation: $file ($from) -> $spec ($to)"; failures=$((failures + 1))
    fi
  done < <(grep -oE "from '[^']+'" "$file" | sed -E "s/from '([^']+)'/\1/")
done < <(find hooks tests -name '*.ts' -o -name '*.tsx' | sort)

# Only the composition root registers hooks, and nothing may import the root.
if grep -rlE "from '(\.\./)*(\./)?register'" hooks tests | grep -v '^hooks/register.tsx$' | grep -q .; then
  echo "something imports register.tsx"; failures=$((failures + 1))
fi
# Services stay behind the port: no engine imports at all.
if grep -rlE "from 'claude-code'" hooks/services hooks/lib | grep -q .; then
  echo "hooks/services and hooks/lib must not import claude-code"; failures=$((failures + 1))
fi
# Nothing but register.tsx may call the engine's $ APIs.
if grep -rhE '\$\.(fs|process|http|mcp|store|clock|ui|session|model|prompt|command|tool)\.' hooks/services hooks/lib hooks/ui hooks/host.ts | grep -vE '^\s*(//|\*)' | grep -q .; then
  echo "found \$ calls outside register.tsx"; failures=$((failures + 1))
fi

if ((failures > 0)); then echo "$failures problem(s)"; exit 1; fi
echo "layers ok"
