#!/usr/bin/env node
/**
 * Clean Architecture MCP Server
 * Zero external dependencies — uses only Node.js built-ins.
 * Implements the Model Context Protocol (JSON-RPC over stdio).
 */

import { createInterface } from 'readline';
import { readFileSync, existsSync, readdirSync, statSync, lstatSync, mkdirSync, writeFileSync } from 'fs';
import { join, relative, extname, dirname, resolve, normalize } from 'path';
import { fileURLToPath } from 'url';

const rl = createInterface({ input: process.stdin, terminal: false });

// ── MCP JSON-RPC transport ─────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function err(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    handleMessage(msg);
  } catch (e) {
    // Ignore parse errors
  }
});

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ca_scan',
    description:
      'Scan a project directory for Clean Architecture Dependency Rule violations. ' +
      'Reports every file that imports from a layer it should not depend on, with severity levels.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Root path of the project to scan (defaults to current working directory).',
        },
      },
    },
  },
  {
    name: 'ca_metrics',
    description:
      'Calculate component stability and abstractness metrics for a project. ' +
      'Reports Fan-in, Fan-out, Instability (I), Abstractness (A), and Distance from Main Sequence (D) ' +
      'for each component, identifying components in the Zone of Pain or Zone of Uselessness.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Root path of the project to analyse.',
        },
      },
    },
  },
  {
    name: 'ca_scaffold',
    description:
      'Create the full Clean Architecture directory and file scaffold for a new project or subsystem. ' +
      'Generates entities/, usecases/ports/input/, usecases/ports/output/, usecases/interactors/, ' +
      'adapters/controllers/, adapters/presenters/, adapters/gateways/, frameworks/, and main/ ' +
      'with appropriate README stubs.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          type: 'string',
          description: 'Absolute path where the scaffold should be created.',
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'java', 'go', 'csharp'],
          description: 'Target programming language (determines file extensions and stubs).',
        },
        domain: {
          type: 'string',
          description: 'Business domain name (e.g. "OrderManagement") — used in stub comments.',
        },
      },
      required: ['rootPath'],
    },
  },
  {
    name: 'ca_layer_of',
    description:
      'Determine which Clean Architecture layer a given file belongs to based on its path, ' +
      'and check whether its imports are compliant with the Dependency Rule.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute or relative path to the source file.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'ca_cycles',
    description:
      'Detect cyclic dependencies between components (ADP — Acyclic Dependencies Principle). ' +
      'Returns every cycle found in the component dependency graph with suggested fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Root path of the project to analyse.',
        },
      },
    },
  },
];

// ── Layer detection helpers ────────────────────────────────────────────────

const LAYER_PATTERNS = [
  {
    layer: 'entities',
    patterns: [/\/entities\//, /\/domain\//, /\/enterprise\//],
    level: 1,
  },
  {
    layer: 'usecases',
    patterns: [/\/usecases\//, /\/use-cases\//, /\/use_cases\//, /\/application\//],
    level: 2,
  },
  {
    layer: 'adapters',
    patterns: [
      /\/adapters\//, /\/interface-adapters\//, /\/controllers\//, /\/presenters\//, /\/gateways\//,
    ],
    level: 3,
  },
  {
    layer: 'frameworks',
    patterns: [/\/frameworks\//, /\/infrastructure\//, /\/web\//, /\/db\//, /\/external\//],
    level: 4,
  },
  {
    layer: 'main',
    patterns: [/\/main\//, /\/bootstrap\//, /\/composition\//],
    level: 5,
  },
];

function detectLayer(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const def of LAYER_PATTERNS) {
    if (def.patterns.some((p) => p.test(normalized))) {
      return def;
    }
  }
  return null;
}

// ── Import extraction ──────────────────────────────────────────────────────

const IMPORT_REGEXES = [
  // JS/TS: import ... from '...'
  /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g,
  // JS/TS: require('...')
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Python: from ... import / import ...
  /^(?:from\s+([\w./]+)\s+import|import\s+([\w./]+))/gm,
  // Java/Kotlin: import ...;
  /^import\s+([\w.]+);/gm,
  // Go: import "..."
  /import\s+"([^"]+)"/g,
];

function extractImports(content) {
  const imports = [];
  for (const regex of IMPORT_REGEXES) {
    let m;
    const re = new RegExp(regex.source, regex.flags);
    while ((m = re.exec(content)) !== null) {
      const imp = m[1] || m[2];
      if (imp) imports.push(imp);
    }
  }
  return [...new Set(imports)];
}

// ── Path safety ───────────────────────────────────────────────────────────

const SAFE_ROOT = resolve(process.cwd());

function safePath(p) {
  if (!p || typeof p !== 'string') return SAFE_ROOT;
  const resolved = resolve(normalize(p));
  if (!resolved.startsWith(SAFE_ROOT)) {
    throw new Error(`Path "${p}" is outside the working directory.`);
  }
  return resolved;
}

// ── File system helpers ────────────────────────────────────────────────────

function walkSrc(dir, exts = ['.ts', '.js', '.py', '.java', '.go', '.cs', '.kt']) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__') continue;
    const full = join(dir, entry);
    const lstat = lstatSync(full);
    if (lstat.isSymbolicLink()) continue; // never follow symlinks
    if (lstat.isDirectory()) {
      files.push(...walkSrc(full, exts));
    } else if (exts.includes(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

// ── Tool: ca_scan ──────────────────────────────────────────────────────────

function toolScan(args) {
  const root = safePath(args.path);
  const srcDir = existsSync(join(root, 'src')) ? join(root, 'src') : root;
  const files = walkSrc(srcDir);

  const violations = [];
  const allowed = {
    entities: [],
    usecases: ['entities'],
    adapters: ['usecases', 'entities'],
    frameworks: ['adapters', 'usecases', 'entities'],
    main: ['frameworks', 'adapters', 'usecases', 'entities'],
  };

  for (const file of files) {
    const layerDef = detectLayer(file);
    if (!layerDef) continue;
    const allowedLayers = allowed[layerDef.layer] || [];

    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }

    const imports = extractImports(content);
    for (const imp of imports) {
      const importedLayer = detectLayer(imp);
      if (!importedLayer) continue;
      if (!allowedLayers.includes(importedLayer.layer) && importedLayer.layer !== layerDef.layer) {
        const severity =
          layerDef.layer === 'entities' ? 'CRITICAL' :
          layerDef.layer === 'usecases' ? 'HIGH' : 'MEDIUM';
        violations.push({
          severity,
          file: relative(root, file),
          layer: layerDef.layer,
          import: imp,
          importedLayer: importedLayer.layer,
          message: `${layerDef.layer} must not depend on ${importedLayer.layer}`,
          fix: `Define an interface (port) in ${layerDef.layer}/ports/ and inject the concrete implementation from main/.`,
        });
      }
    }
  }

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const v of violations) counts[v.severity]++;

  const score = Math.max(0, 100 - counts.CRITICAL * 20 - counts.HIGH * 10 - counts.MEDIUM * 5);

  return {
    summary: {
      filesScanned: files.length,
      violations: violations.length,
      critical: counts.CRITICAL,
      high: counts.HIGH,
      medium: counts.MEDIUM,
      healthScore: score,
      grade:
        score >= 90 ? 'A — Excellent' :
        score >= 75 ? 'B — Good' :
        score >= 50 ? 'C — Fair' :
        score >= 25 ? 'D — Poor' : 'F — Critical',
    },
    violations,
  };
}

// ── Tool: ca_metrics ──────────────────────────────────────────────────────

function toolMetrics(args) {
  const root = safePath(args.path);
  const srcDir = existsSync(join(root, 'src')) ? join(root, 'src') : root;
  const files = walkSrc(srcDir);

  // Build component → files map
  const components = {};
  for (const file of files) {
    const layerDef = detectLayer(file);
    if (!layerDef) continue;
    if (!components[layerDef.layer]) components[layerDef.layer] = { files: [], fanIn: 0, fanOut: 0, abstractClasses: 0 };
    components[layerDef.layer].files.push(file);
  }

  // Count fan-in / fan-out and abstract classes
  for (const [comp, data] of Object.entries(components)) {
    let abstractCount = 0;
    for (const file of data.files) {
      let content;
      try { content = readFileSync(file, 'utf8'); } catch { continue; }

      // Detect abstract classes/interfaces
      if (/(?:interface\s+\w|abstract\s+class\s+\w|class\s+\w[^{]*implements|ABC\)|@abstractmethod)/.test(content)) {
        abstractCount++;
      }

      // Count outgoing dependencies to other layers
      const imports = extractImports(content);
      for (const imp of imports) {
        const importedLayer = detectLayer(imp);
        if (importedLayer && importedLayer.layer !== comp) {
          data.fanOut++;
          if (components[importedLayer.layer]) {
            components[importedLayer.layer].fanIn++;
          }
        }
      }
    }
    data.abstractClasses = abstractCount;
  }

  const metrics = [];
  for (const [comp, data] of Object.entries(components)) {
    const ca = data.fanIn;
    const ce = data.fanOut;
    const total = ca + ce;
    const instability = total === 0 ? 0 : ce / total;
    const nc = data.files.length;
    const na = data.abstractClasses;
    const abstractness = nc === 0 ? 0 : na / nc;
    const distance = Math.abs(abstractness + instability - 1);

    metrics.push({
      component: comp,
      files: nc,
      fanIn: ca,
      fanOut: ce,
      instability: instability.toFixed(2),
      abstractClasses: na,
      abstractness: abstractness.toFixed(2),
      distanceFromMainSequence: distance.toFixed(2),
      zone:
        distance > 0.7 && abstractness < 0.3 && instability < 0.3 ? 'ZONE OF PAIN ⚠' :
        distance > 0.7 && abstractness > 0.7 && instability > 0.7 ? 'ZONE OF USELESSNESS ⚠' :
        'Main Sequence ✓',
    });
  }

  return { metrics };
}

// ── Tool: ca_scaffold ─────────────────────────────────────────────────────

const EXT_MAP = {
  typescript: 'ts', javascript: 'js', python: 'py',
  java: 'java', go: 'go', csharp: 'cs',
};

const VALID_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'java', 'go', 'csharp']);

function toolScaffold(args) {
  const safeRoot = safePath(args.rootPath);
  const lang = VALID_LANGUAGES.has(args.language) ? args.language : 'typescript';
  const domain = (args.domain || 'Domain').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'Domain';
  const ext = EXT_MAP[lang] || 'ts';

  const dirs = [
    'src/entities',
    'src/usecases/ports/input',
    'src/usecases/ports/output',
    'src/usecases/interactors',
    'src/adapters/controllers',
    'src/adapters/presenters',
    'src/adapters/gateways',
    'src/adapters/gateways/in-memory',
    'src/frameworks/web',
    'src/frameworks/db',
    'src/frameworks/external',
    'src/main',
    'tests/unit/entities',
    'tests/unit/usecases',
    'tests/unit/adapters/presenters',
    'tests/unit/adapters/controllers',
    'tests/integration/gateways',
    'tests/e2e',
  ];

  const created = [];
  for (const dir of dirs) {
    const full = join(safeRoot, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      created.push(dir + '/');
    }
  }

  // Stub files
  const stubs = [
    {
      path: `src/entities/.gitkeep`,
      content: `# Layer 1: Enterprise Business Rules\n# No imports from any other src layer allowed here.\n`,
    },
    {
      path: `src/usecases/ports/input/.gitkeep`,
      content: `# Input Port interfaces — define what the use case accepts.\n`,
    },
    {
      path: `src/usecases/ports/output/.gitkeep`,
      content: `# Output Port & Repository interfaces — define what the use case needs.\n# These interfaces live here (use case layer), NOT in adapters/.\n`,
    },
    {
      path: `src/main/index.${ext}`,
      content: `// MAIN COMPONENT — Composition Root\n// This is the ONLY file allowed to import concrete implementations from all layers.\n// Wire all dependencies here. Nothing imports from main/.\n`,
    },
    {
      path: `src/ARCHITECTURE.md`,
      content: `# ${domain} — Architecture\n\n## Layers\n\n| Layer | Path | Rule |\n|---|---|---|\n| Entities | \`src/entities/\` | No imports from other layers |\n| Use Cases | \`src/usecases/\` | May only import from entities/ |\n| Interface Adapters | \`src/adapters/\` | May import from usecases/ and entities/ |\n| Frameworks & Drivers | \`src/frameworks/\` | May import from all inner layers |\n| Main | \`src/main/\` | Wires everything — not imported by anyone |\n\n## Dependency Rule\n\nAll source code dependencies point **inward only**.\n`,
    },
  ];

  for (const stub of stubs) {
    const full = join(safeRoot, stub.path);
    if (!existsSync(full)) {
      writeFileSync(full, stub.content);
      created.push(stub.path);
    }
  }

  return {
    message: `Scaffold created for domain "${domain}" (${lang})`,
    created,
    nextSteps: [
      `Run /clean-architecture:entity ${domain} to create your first entity`,
      `Run /clean-architecture:usecase Create${domain} to create your first use case`,
      `Run /clean-architecture:check to verify the dependency rule`,
    ],
  };
}

// ── Tool: ca_layer_of ─────────────────────────────────────────────────────

function toolLayerOf(args) {
  const safeFile = safePath(args.filePath);
  const layerDef = detectLayer(safeFile);

  if (!layerDef) {
    return {
      layer: 'unknown',
      message: `Could not determine layer for: ${safeFile}`,
      suggestion: 'Move the file into one of: src/entities/, src/usecases/, src/adapters/, src/frameworks/, or src/main/',
    };
  }

  let content;
  try { content = readFileSync(safeFile, 'utf8'); } catch {
    return { layer: layerDef.layer, level: layerDef.level, importViolations: [] };
  }

  const allowedLayers = {
    entities: [],
    usecases: ['entities'],
    adapters: ['usecases', 'entities'],
    frameworks: ['adapters', 'usecases', 'entities'],
    main: ['frameworks', 'adapters', 'usecases', 'entities'],
  }[layerDef.layer] || [];

  const imports = extractImports(content);
  const violations = [];
  for (const imp of imports) {
    const importedLayer = detectLayer(imp);
    if (importedLayer && importedLayer.layer !== layerDef.layer && !allowedLayers.includes(importedLayer.layer)) {
      violations.push({ import: imp, importedLayer: importedLayer.layer });
    }
  }

  return {
    layer: layerDef.layer,
    level: layerDef.level,
    dependencyRuleCompliant: violations.length === 0,
    importViolations: violations,
    allowedDependencies: allowedLayers.length ? allowedLayers : ['none — this is the innermost layer'],
  };
}

// ── Tool: ca_cycles ───────────────────────────────────────────────────────

function toolCycles(args) {
  const root = safePath(args.path);
  const srcDir = existsSync(join(root, 'src')) ? join(root, 'src') : root;
  const files = walkSrc(srcDir);

  // Build adjacency map: component → Set<component>
  const graph = {};
  for (const def of LAYER_PATTERNS) graph[def.layer] = new Set();

  for (const file of files) {
    const layerDef = detectLayer(file);
    if (!layerDef) continue;
    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }
    for (const imp of extractImports(content)) {
      const importedLayer = detectLayer(imp);
      if (importedLayer && importedLayer.layer !== layerDef.layer) {
        graph[layerDef.layer].add(importedLayer.layer);
      }
    }
  }

  // DFS cycle detection
  const cycles = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const neighbor of (graph[node] || [])) {
      dfs(neighbor, [...path, node]);
    }
    stack.delete(node);
  }

  for (const node of Object.keys(graph)) dfs(node, []);

  const fixes = cycles.map((cycle) => ({
    cycle: cycle.join(' → '),
    fix: `Break the cycle by extracting a shared abstraction or introducing an interface (DIP) at one of: ${cycle.slice(0, -1).join(' or ')}`,
  }));

  return {
    cyclesFound: cycles.length,
    adpCompliant: cycles.length === 0,
    cycles: fixes,
    message: cycles.length === 0
      ? 'No cycles detected. ADP (Acyclic Dependencies Principle) is satisfied.'
      : `${cycles.length} cycle(s) found. ADP is violated — see cycles array for details and fixes.`,
  };
}

// ── Message dispatch ───────────────────────────────────────────────────────

function handleMessage(msg) {
  const { method, id, params } = msg;

  if (method === 'initialize') {
    ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'clean-architecture', version: '1.0.0' },
    });
    return;
  }

  if (method === 'notifications/initialized') return; // no response

  if (method === 'tools/list') {
    ok(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    try {
      let result;
      switch (name) {
        case 'ca_scan':     result = toolScan(args);     break;
        case 'ca_metrics':  result = toolMetrics(args);  break;
        case 'ca_scaffold': result = toolScaffold(args); break;
        case 'ca_layer_of': result = toolLayerOf(args);  break;
        case 'ca_cycles':   result = toolCycles(args);   break;
        default:
          err(id, -32601, `Unknown tool: ${name}`);
          return;
      }
      ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
      ok(id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
    return;
  }

  if (id !== undefined) {
    err(id, -32601, 'Method not found');
  }
}

// Keep the process alive for stdio communication
process.stdin.resume();
