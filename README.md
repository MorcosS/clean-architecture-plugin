# Clean Architecture Plugin for Claude Code

A native Claude Code plugin that enforces and guides implementation of **Clean Architecture** as defined by Robert C. Martin ("Uncle Bob") in *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

## Installation

### Option 1 — Install directly (recommended)

In any Claude Code session:

```
/plugin install morcoss/clean-architecture-plugin
```

> **Note:** `/plugin marketplace add` and `/plugin install` are different commands.
> - `/plugin marketplace add morcoss/clean-architecture-plugin` — registers this repo as a **marketplace** (a registry), then you still need to install the plugin from it.
> - `/plugin install morcoss/clean-architecture-plugin` — installs the **plugin directly**. This is what you want.

### Option 2 — Via marketplace (two steps)

```
/plugin marketplace add morcoss/clean-architecture-plugin
/plugin install clean-architecture@morcoss-clean-architecture-plugin
```

### Option 3 — Install from a local clone

```bash
git clone https://github.com/morcoss/clean-architecture-plugin.git
```

Then in Claude Code:

```
/plugin install /path/to/clean-architecture-plugin
```

### Option 4 — Point Claude Code directly at the directory

```bash
claude --plugin-dir /path/to/clean-architecture-plugin
```

## Requirements

- Claude Code (latest version)
- Node.js 18+ (for the MCP server — the dependency scanner, metrics calculator, and scaffolder)

No `npm install` needed — the MCP server uses only Node.js built-ins.

## Available Commands

All commands are namespaced under `/clean-architecture:`.

| Command | What it does |
|---|---|
| `/clean-architecture:init` | Scaffold a full Clean Architecture project |
| `/clean-architecture:entity` | Create an Enterprise Business Rule entity |
| `/clean-architecture:usecase` | Create a Use Case interactor with Input/Output Ports |
| `/clean-architecture:controller` | Create an Interface Adapter controller |
| `/clean-architecture:presenter` | Create a Presenter (Humble Object Pattern) |
| `/clean-architecture:gateway` | Create a Gateway/Repository with data mapper |
| `/clean-architecture:boundary` | Define and enforce architectural boundaries |
| `/clean-architecture:solid` | Audit and fix SOLID principle violations |
| `/clean-architecture:components` | Audit component cohesion (REP/CCP/CRP) and coupling (ADP/SDP/SAP) |
| `/clean-architecture:check` | Full Dependency Rule violation scan |
| `/clean-architecture:review` | 100-point Clean Architecture audit scorecard |
| `/clean-architecture:test` | Create Test Boundary compliant tests by layer |
| `/clean-architecture:main` | Create/update the Main composition root |
| `/clean-architecture:diagram` | Generate architecture diagrams (ASCII + Mermaid) |
| `/clean-architecture:migrate` | Phased migration from any anti-pattern to Clean Architecture |

## MCP Tools (used automatically by Claude)

The plugin ships an MCP server (`src/server.js`) that gives Claude real file-system analysis capabilities:

| Tool | Description |
|---|---|
| `ca_scan` | Scans every source file for Dependency Rule violations — returns severity, file, line, and fix |
| `ca_metrics` | Calculates Fan-in, Fan-out, Instability (I), Abstractness (A), and Distance from Main Sequence (D) per component |
| `ca_scaffold` | Creates the full directory and file scaffold for a new Clean Architecture project |
| `ca_layer_of` | Identifies which layer a file belongs to and checks its imports for compliance |
| `ca_cycles` | Detects cyclic dependencies between components (ADP check) |

## Real-time Hook

The plugin registers a **PostToolUse hook** that fires after every file edit. If the file you just wrote violates the Dependency Rule, you'll see a warning inline in Claude Code immediately:

```
⚠️  CLEAN ARCHITECTURE — DEPENDENCY RULE VIOLATION
   File:  src/usecases/interactors/PlaceOrderInteractor.ts
   Layer: USECASES (may only depend on: entities)

   ✗ imports "../../adapters/gateways/PostgresOrderRepo" (adapters layer)

   Fix: Define an interface (port) in usecases/ports/ and inject the concrete impl from main/.
```

## Usage Examples

```
/clean-architecture:init TypeScript REST API for order management
/clean-architecture:entity Order
/clean-architecture:usecase PlaceOrder
/clean-architecture:check
/clean-architecture:review
/clean-architecture:solid src/
/clean-architecture:migrate src/services/
```

## Clean Architecture Concepts Covered

**Layers:** Entities → Use Cases → Interface Adapters → Frameworks & Drivers → Main

**Principles:**
- The Dependency Rule (Chapter 22)
- SOLID — SRP, OCP, LSP, ISP, DIP (Part III)
- Component Cohesion — REP, CCP, CRP (Chapter 13)
- Component Coupling — ADP, SDP, SAP (Chapter 14)
- Screaming Architecture (Chapter 21)
- Humble Object Pattern (Chapter 23)
- Partial Boundaries (Chapter 24)
- The Main Component (Chapter 26)
- Test Boundary (Chapter 28)
- The Database is a Detail (Chapter 30)
- The Web is a Detail (Chapter 32)
- Frameworks are Details (Chapter 33)

## Project Structure Generated by `/clean-architecture:init`

```
src/
├── entities/                 # Enterprise Business Rules (no dependencies)
├── usecases/
│   ├── ports/
│   │   ├── input/            # Input Port interfaces
│   │   └── output/           # Output Port & Repository interfaces
│   └── interactors/          # Use Case implementations
├── adapters/
│   ├── controllers/          # Framework input → Use Case request model
│   ├── presenters/           # Use Case response model → View model
│   └── gateways/             # Repository implementations + data mappers
│       └── in-memory/        # In-memory repos for unit tests
├── frameworks/
│   ├── web/                  # HTTP framework wiring
│   ├── db/                   # Database drivers & ORM config
│   └── external/             # Third-party API clients
└── main/                     # Composition Root — wires everything
tests/
├── unit/                     # Pure tests, no I/O
├── integration/              # Gateway tests with real DB
└── e2e/                      # Full stack tests
```

## License

MIT
