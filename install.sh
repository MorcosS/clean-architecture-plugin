#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[ca-plugin]${NC} $*"; }
warn()    { echo -e "${YELLOW}[ca-plugin]${NC} $*"; }
error()   { echo -e "${RED}[ca-plugin]${NC} $*" >&2; }

# ── Prerequisite check ────────────────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  warn "Claude Code CLI not found in PATH. Skills will be installed anyway."
  warn "Install Claude Code from: https://claude.ai/code"
fi

# ── Create directories ────────────────────────────────────────────────────────
info "Creating Claude directories..."
mkdir -p "${SKILLS_DIR}"
mkdir -p "${HOOKS_DIR}"

# ── Install skills ────────────────────────────────────────────────────────────
info "Installing Clean Architecture skills..."
for skill_file in "${PLUGIN_DIR}/skills/"*.md; do
  skill_name="$(basename "${skill_file}")"
  cp "${skill_file}" "${SKILLS_DIR}/${skill_name}"
  info "  ✓ Installed skill: /${skill_name%.md}"
done

# ── Install hooks ─────────────────────────────────────────────────────────────
info "Installing hooks..."
for hook_file in "${PLUGIN_DIR}/hooks/"*.sh; do
  hook_name="$(basename "${hook_file}")"
  cp "${hook_file}" "${HOOKS_DIR}/${hook_name}"
  chmod +x "${HOOKS_DIR}/${hook_name}"
  info "  ✓ Installed hook: ${hook_name}"
done

# ── Merge settings.json ───────────────────────────────────────────────────────
info "Updating ${SETTINGS_FILE}..."

HOOK_CONFIG='{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "'"${HOOKS_DIR}/dependency-check.sh"'"
          }
        ]
      }
    ]
  }
}'

if [ -f "${SETTINGS_FILE}" ]; then
  # Merge with existing settings using Python (available on most systems)
  if command -v python3 &>/dev/null; then
    python3 - <<PYEOF
import json, sys

settings_path = "${SETTINGS_FILE}"
new_hooks = ${HOOK_CONFIG}

with open(settings_path, "r") as f:
    existing = json.load(f)

# Deep merge hooks
existing_hooks = existing.get("hooks", {})
new_hook_section = new_hooks.get("hooks", {})
for event, handlers in new_hook_section.items():
    if event not in existing_hooks:
        existing_hooks[event] = []
    # Avoid duplicate entries
    existing_ids = [h.get("command") for h in existing_hooks[event] if isinstance(h, dict)]
    for handler in handlers:
        for h in handler.get("hooks", []):
            if h.get("command") not in existing_ids:
                existing_hooks[event].append(handler)
existing["hooks"] = existing_hooks

with open(settings_path, "w") as f:
    json.dump(existing, f, indent=2)
print("  Merged into existing settings.json")
PYEOF
  else
    warn "python3 not found; skipping automatic settings merge."
    warn "Manually add the following to ${SETTINGS_FILE}:"
    echo "${HOOK_CONFIG}"
  fi
else
  echo "${HOOK_CONFIG}" > "${SETTINGS_FILE}"
  info "  ✓ Created settings.json"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "Clean Architecture Plugin installed successfully!"
echo ""
echo "  Available commands:"
echo "    /ca-init        — Scaffold a Clean Architecture project"
echo "    /ca-entity      — Create an Entity"
echo "    /ca-usecase     — Create a Use Case"
echo "    /ca-controller  — Create a Controller"
echo "    /ca-presenter   — Create a Presenter"
echo "    /ca-gateway     — Create a Gateway / Repository"
echo "    /ca-boundary    — Define architectural boundaries"
echo "    /ca-solid       — Audit SOLID principles"
echo "    /ca-components  — Audit component cohesion & coupling"
echo "    /ca-check       — Scan for Dependency Rule violations"
echo "    /ca-review      — Full Clean Architecture review"
echo "    /ca-test        — Create Clean-Architecture-compliant tests"
echo "    /ca-main        — Create the Main composition root"
echo "    /ca-diagram     — Generate architecture diagrams"
echo "    /ca-migrate     — Migrate existing code to Clean Architecture"
echo ""
