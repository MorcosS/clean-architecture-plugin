#!/usr/bin/env bash
set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[ca-plugin]${NC} $*"; }
warn() { echo -e "${YELLOW}[ca-plugin]${NC} $*"; }

CA_SKILLS=(
  ca-init ca-entity ca-usecase ca-controller ca-presenter
  ca-gateway ca-boundary ca-solid ca-components ca-check
  ca-review ca-test ca-main ca-diagram ca-migrate
)

info "Removing Clean Architecture skills..."
for skill in "${CA_SKILLS[@]}"; do
  target="${SKILLS_DIR}/${skill}.md"
  if [ -f "${target}" ]; then
    rm "${target}"
    info "  ✓ Removed skill: /${skill}"
  fi
done

info "Removing hooks..."
for hook in dependency-check.sh; do
  target="${HOOKS_DIR}/${hook}"
  if [ -f "${target}" ]; then
    rm "${target}"
    info "  ✓ Removed hook: ${hook}"
  fi
done

# Remove hook entries from settings.json
if [ -f "${SETTINGS_FILE}" ] && command -v python3 &>/dev/null; then
  python3 - <<PYEOF
import json

path = "${SETTINGS_FILE}"
hook_cmd = "${HOOKS_DIR}/dependency-check.sh"

with open(path) as f:
    data = json.load(f)

hooks = data.get("hooks", {})
for event in list(hooks.keys()):
    hooks[event] = [
        h for h in hooks[event]
        if not any(
            inner.get("command") == hook_cmd
            for inner in (h.get("hooks") or [])
            if isinstance(inner, dict)
        )
    ]
    if not hooks[event]:
        del hooks[event]

data["hooks"] = hooks
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("  Updated settings.json")
PYEOF
else
  warn "Manually remove the ca-plugin hook entries from ${SETTINGS_FILE}"
fi

info "Uninstall complete."
