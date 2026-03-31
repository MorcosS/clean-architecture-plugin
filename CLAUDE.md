# Clean Architecture Plugin — Global Instructions

This project uses the **Clean Architecture** plugin. All code you write or review must conform to the principles established by Robert C. Martin in *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

## Non-Negotiable Rules

### 1. The Dependency Rule
Source code dependencies MUST point only **inward** — toward higher-level policy.

```
Entities  ←  Use Cases  ←  Interface Adapters  ←  Frameworks & Drivers
(inner)                                              (outer)
```

- Outer layers may depend on inner layers.
- Inner layers MUST NEVER import from outer layers.
- If an inner layer needs to call an outer layer, use a **boundary interface** (DIP).

### 2. Layer Responsibilities

| Layer | Folder | Contains | May depend on |
|---|---|---|---|
| Entities | `src/entities/` | Enterprise business rules, data structures | Nothing (pure) |
| Use Cases | `src/usecases/` | Application business rules, interactors, ports | Entities only |
| Interface Adapters | `src/adapters/` | Controllers, Presenters, Gateways | Use Cases, Entities |
| Frameworks & Drivers | `src/frameworks/` | Web, DB, external tools | All layers |
| Main | `src/main/` | Composition root, wiring | All layers |

### 3. Entities
- Must contain only enterprise-wide business rules.
- Must have NO knowledge of use cases, databases, UI, or frameworks.
- Can be plain objects, classes, or sets of functions.
- Must be the most stable code in the system.

### 4. Use Cases
- Orchestrate the flow of data to/from entities.
- Define **Input Ports** (interfaces the controller calls) in `usecases/ports/input/`.
- Define **Output Ports** (interfaces the presenter implements) in `usecases/ports/output/`.
- The interactor implements the Input Port and calls the Output Port.
- MUST NOT know about HTTP, SQL, UI, or any framework.

### 5. Interface Adapters
- **Controllers**: Convert framework input (HTTP request, CLI args) → use case input model.
- **Presenters**: Implement Output Port; convert use case output model → view model.
- **Gateways**: Implement repository interfaces defined in use cases; translate between domain objects and DB rows.

### 6. Frameworks & Drivers
- Thin adapters that plug into the architecture.
- All framework-specific code lives here.
- The DB is a detail. The web is a detail. Frameworks are details.

### 7. SOLID Principles
Always apply:
- **SRP**: A module should have one, and only one, reason to change.
- **OCP**: Open for extension, closed for modification.
- **LSP**: Subtypes must be substitutable for their base types.
- **ISP**: Do not depend on interfaces you don't use.
- **DIP**: Depend on abstractions, not concretions.

### 8. Screaming Architecture
The top-level structure of the codebase should scream its domain (e.g., `OrderManagement`, `UserRegistration`), NOT its framework (not `rails/`, `django/`, `spring/`).

### 9. Humble Object Pattern
Split every object that touches a boundary (UI, DB, network) into two parts:
1. **Humble Object**: Hard-to-test, thin; just calls the framework.
2. **Testable Object**: Contains all logic; framework-independent.
Use this for Presenters, Views, and Database Gateways.

### 10. Test Boundary
- Tests are part of the outermost circle — they depend on inner layers but nothing depends on them.
- Use case tests must NOT touch the DB, web, or UI.
- Entity tests must NOT touch use cases.
- Follow the same Dependency Rule for test code.

## When Reviewing or Writing Code

Always check:
1. Does any import in an inner layer reference an outer layer path?
2. Do entities contain application or framework logic?
3. Do use cases reference HTTP status codes, SQL, or ORMs?
4. Are input/output port interfaces defined in the use case layer?
5. Is the Main component the ONLY place where dependencies are wired together?
6. Does each component have a single axis of change (SRP)?
7. Are there cyclic dependencies between components?

## Available Skills

- `/ca-init [description]` — Scaffold project
- `/ca-entity [Name]` — Create entity
- `/ca-usecase [Name]` — Create use case
- `/ca-controller [Name]` — Create controller
- `/ca-presenter [Name]` — Create presenter
- `/ca-gateway [Name]` — Create gateway
- `/ca-boundary [description]` — Define boundary
- `/ca-solid [path]` — SOLID audit
- `/ca-components [path]` — Component cohesion/coupling audit
- `/ca-check` — Dependency Rule scan
- `/ca-review` — Full architecture review
- `/ca-test [Name]` — Create compliant tests
- `/ca-main` — Create/update composition root
- `/ca-diagram` — Generate architecture diagrams
- `/ca-migrate [path]` — Migrate existing code
