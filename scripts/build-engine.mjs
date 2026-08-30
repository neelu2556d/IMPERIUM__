// Assemble the forkable Vitality Tile Engine (engine/) from the canonical sources.
//
// The engine is a SLICE, not a copy of the app: the design DNA pack + the real
// shipped tiles + a self-check, packaged so a fork "just adds it" and Claude Code
// builds Vitality-native tiles as ambient context (no commands, no keys, no app).
//
// Single source of truth stays where it already lives:
//   - mcp/dna/**            -> engine/dna/**        (the look/feel/voice reference)
//   - lib/tiles/featuredHtml.json -> engine/examples/*.html  (the REAL shipped tiles)
// engine/ENGINE.md, engine/README.md and engine/lint.mjs are hand-authored and left
// untouched. Re-run this whenever the DNA pack or the featured tiles change:
//   node scripts/build-engine.mjs
//
// It only reads from Vitality and writes under engine/. Nothing else.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DNA_SRC = join(ROOT, 'mcp', 'dna');
const TILES_JSON = join(ROOT, 'lib', 'tiles', 'featuredHtml.json');
const ENGINE = join(ROOT, 'engine');
const DNA_OUT = join(ENGINE, 'dna');
const EX_OUT = join(ENGINE, 'examples');

function freshDir(p) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  mkdirSync(p, { recursive: true });
}

// 1) Copy the DNA pack verbatim (markdown + the showcase render).
freshDir(DNA_OUT);
const dnaFiles = readdirSync(DNA_SRC).filter((f) => f.endsWith('.md') || f.endsWith('.html'));
for (const f of dnaFiles) {
  writeFileSync(join(DNA_OUT, f), readFileSync(join(DNA_SRC, f)));
}

// 2) Explode the real shipped tiles into standalone .html files a builder can open.
freshDir(EX_OUT);
const tiles = JSON.parse(readFileSync(TILES_JSON, 'utf8'));
const exampleIds = Object.keys(tiles);
for (const id of exampleIds) {
  writeFileSync(join(EX_OUT, `${id}.html`), tiles[id]);
}

// 3) A machine-readable manifest: what the slice contains + where it came from.
//    (No timestamp — Date.now() is intentionally avoided so the build is deterministic.)
const manifest = {
  name: 'vitality-tile-engine',
  what: 'A forkable slice of Vitality: the design DNA + real tiles that let Claude Code build Vitality-native dashboard tiles as ambient context. No commands, no keys, no app.',
  selfContained: true,
  takesFrom: 'vitality-only',
  entry: 'ENGINE.md',
  selfCheck: 'lint.mjs',
  dna: dnaFiles.sort(),
  examples: exampleIds.sort(),
  regenerate: 'node scripts/build-engine.mjs',
  sources: {
    dna: 'mcp/dna/',
    examples: 'lib/tiles/featuredHtml.json',
  },
};
writeFileSync(join(ENGINE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(
  `engine/ assembled: ${dnaFiles.length} DNA files, ${exampleIds.length} real tiles.\n` +
    `  dna:      ${DNA_OUT.replace(ROOT + '/', '')}\n` +
    `  examples: ${EX_OUT.replace(ROOT + '/', '')}\n` +
    `  manifest: engine/manifest.json`,
);
