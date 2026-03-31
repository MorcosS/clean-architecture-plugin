#!/usr/bin/env bash
# Clean Architecture Dependency Rule Hook
# Runs after every file Write/Edit to warn about dependency violations.
#
# Installed by: clean-architecture-plugin
# Trigger: PostToolUse (Write, Edit, MultiEdit)

# Only check files inside src/ — ignore tests/, docs/, config files
MODIFIED_FILE="${CLAUDE_TOOL_RESULT:-}"

# If no file info available, skip silently
if [ -z "${MODIFIED_FILE}" ]; then
  exit 0
fi

# Extract the file path from the tool result (handles JSON format)
FILE_PATH=$(echo "${MODIFIED_FILE}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('filePath', data.get('file_path', '')))
except:
    print('')
" 2>/dev/null)

if [ -z "${FILE_PATH}" ]; then
  exit 0
fi

# Normalize to relative path from repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
REL_PATH="${FILE_PATH#${REPO_ROOT}/}"

# Skip non-source files
case "${REL_PATH}" in
  src/*) ;;  # Only check src/ files
  *)     exit 0 ;;
esac

# Determine the layer of the modified file
LAYER=""
case "${REL_PATH}" in
  src/entities/*|src/domain/*|src/enterprise/*)
    LAYER="entities" ;;
  src/usecases/*|src/use-cases/*|src/application/*|src/use_cases/*)
    LAYER="usecases" ;;
  src/adapters/*|src/interface-adapters/*|src/controllers/*|src/presenters/*|src/gateways/*)
    LAYER="adapters" ;;
  src/frameworks/*|src/infrastructure/*|src/web/*|src/db/*|src/external/*)
    LAYER="frameworks" ;;
  src/main/*|src/bootstrap/*|src/composition/*)
    LAYER="main" ;;
  *)
    exit 0 ;;
esac

# Define forbidden imports per layer
check_violations() {
  local file="$1"
  local layer="$2"
  local violations=0

  if [ ! -f "${file}" ]; then
    return 0
  fi

  case "${layer}" in
    entities)
      # Entities must NOT import from any other src layer
      if grep -nE "(import|from|require).*(usecases|use-cases|use_cases|adapters|interface-adapters|frameworks|infrastructure|main|bootstrap)" "${file}" 2>/dev/null | grep -v "^[[:space:]]*[/#*]"; then
        echo ""
        echo "⚠️  CLEAN ARCHITECTURE VIOLATION DETECTED"
        echo "   File: ${file}"
        echo "   Layer: ENTITIES (innermost — must have zero dependencies)"
        echo "   Rule: Entities must NEVER import from use cases, adapters, frameworks, or main."
        echo "   Fix: Remove these imports. Extract the dependency to a use case or use DIP."
        echo ""
        violations=1
      fi
      ;;
    usecases)
      # Use cases must NOT import from adapters, frameworks, or main
      if grep -nE "(import|from|require).*(adapters|interface-adapters|controllers|presenters|gateways|frameworks|infrastructure|web|db|external|main|bootstrap)" "${file}" 2>/dev/null | grep -v "^[[:space:]]*[/#*]"; then
        echo ""
        echo "⚠️  CLEAN ARCHITECTURE VIOLATION DETECTED"
        echo "   File: ${file}"
        echo "   Layer: USE CASES (may only depend on entities)"
        echo "   Rule: Use cases must NEVER import from adapters, frameworks, or main."
        echo "   Fix: Define an interface (port) in usecases/ports/output/ and use DIP."
        echo ""
        violations=1
      fi
      ;;
    adapters)
      # Adapters must NOT import from main
      if grep -nE "(import|from|require).*(\/main\/|\/bootstrap\/|\/composition\/)" "${file}" 2>/dev/null | grep -v "^[[:space:]]*[/#*]"; then
        echo ""
        echo "⚠️  CLEAN ARCHITECTURE VIOLATION DETECTED"
        echo "   File: ${file}"
        echo "   Layer: ADAPTERS"
        echo "   Rule: Adapters must NEVER import from main."
        echo "   Fix: Main should inject dependencies into adapters, not the other way around."
        echo ""
        violations=1
      fi
      ;;
  esac

  return $violations
}

VIOLATIONS=$(check_violations "${FILE_PATH}" "${LAYER}")

if [ -n "${VIOLATIONS}" ]; then
  echo "${VIOLATIONS}"
  echo "Run /ca-check for a full dependency violation scan."
  echo "Run /ca-solid for SOLID principle analysis."
  # Exit 0 so Claude Code continues (warning only, not blocking)
fi

exit 0
