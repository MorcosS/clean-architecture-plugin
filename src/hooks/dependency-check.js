#!/usr/bin/env node
/**
 * PostToolUse hook — checks the just-edited file for Dependency Rule violations.
 * Prints a warning to stderr (visible in Claude Code) but exits 0 so Claude continues.
 */

import { readFileSync, existsSync } from 'fs';

const LAYER_PATTERNS = [
  { layer: 'entities',   patterns: [/\/entities\//, /\/domain\//, /\/enterprise\//],   level: 1 },
  { layer: 'usecases',   patterns: [/\/usecases\//, /\/use-cases\//, /\/application\//], level: 2 },
  { layer: 'adapters',   patterns: [/\/adapters\//, /\/controllers\//, /\/presenters\//, /\/gateways\//], level: 3 },
  { layer: 'frameworks', patterns: [/\/frameworks\//, /\/infrastructure\//, /\/web\//, /\/db\//], level: 4 },
  { layer: 'main',       patterns: [/\/main\//, /\/bootstrap\//], level: 5 },
];

const ALLOWED = {
  entities:   [],
  usecases:   ['entities'],
  adapters:   ['usecases', 'entities'],
  frameworks: ['adapters', 'usecases', 'entities'],
  main:       ['frameworks', 'adapters', 'usecases', 'entities'],
};

function detectLayer(path) {
  const p = path.replace(/\\/g, '/');
  return LAYER_PATTERNS.find(d => d.patterns.some(r => r.test(p))) || null;
}

function extractImports(content) {
  const out = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^(?:from\s+([\w./]+)\s+import|import\s+([\w./]+))/gm,
    /^import\s+([\w.]+);/gm,
  ];
  for (const re of patterns) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(content)) !== null) {
      const v = m[1] || m[2];
      if (v) out.push(v);
    }
  }
  return out;
}

// Read file path from environment or stdin (Claude Code passes tool context)
let filePath = process.env.CLAUDE_TOOL_FILE || '';

if (!filePath) {
  try {
    const input = readFileSync('/dev/stdin', 'utf8');
    const parsed = JSON.parse(input);
    filePath = parsed.filePath || parsed.file_path || '';
  } catch { /* no stdin */ }
}

if (!filePath || !existsSync(filePath)) process.exit(0);
if (!/\/(src|lib|app)\//.test(filePath)) process.exit(0);

const layerDef = detectLayer(filePath);
if (!layerDef) process.exit(0);

let content;
try { content = readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

const allowed = ALLOWED[layerDef.layer] || [];
const imports = extractImports(content);
const violations = [];

for (const imp of imports) {
  const impLayer = detectLayer(imp);
  if (impLayer && impLayer.layer !== layerDef.layer && !allowed.includes(impLayer.layer)) {
    violations.push({ import: imp, importedLayer: impLayer.layer });
  }
}

if (violations.length > 0) {
  process.stderr.write([
    '',
    '⚠️  CLEAN ARCHITECTURE — DEPENDENCY RULE VIOLATION',
    `   File:  ${filePath}`,
    `   Layer: ${layerDef.layer.toUpperCase()} (may only depend on: ${allowed.join(', ') || 'nothing'})`,
    '',
    ...violations.map(v => `   ✗ imports "${v.import}" (${v.importedLayer} layer)`),
    '',
    '   Fix: Define an interface (port) in usecases/ports/ and inject the concrete impl from main/.',
    '   Run /clean-architecture:check for a full scan.',
    '',
  ].join('\n'));
}

process.exit(0);
