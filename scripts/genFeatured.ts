/**
 * gen:featured — regenerate the numeric Arts District featured tiles from the
 * deterministic MCP builder, so they carry the same full-grade face (progress ring,
 * target-aware 7-day chart, streak, warm insight) as a scaffold_tile tile instead of
 * a thinner hand-authored version.
 *
 * For every DEF that has a `build` recipe it renders + verifies the sealed html via
 * lib/tiles/featuredCodegen.renderFeaturedHtml and writes it into
 * lib/tiles/featuredHtml.json keyed by id. Entries WITHOUT a `build` (one-line-journal,
 * the text tile) keep their existing hand-authored html untouched.
 *
 * Run:  npm run gen:featured
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DEFS } from '@/lib/tiles/featured'
import { renderFeaturedHtml } from '@/lib/tiles/featuredCodegen'

const here = dirname(fileURLToPath(import.meta.url))
const jsonPath = join(here, '..', 'lib', 'tiles', 'featuredHtml.json')

const current = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, string>
const next: Record<string, string> = { ...current }

let generated = 0
for (const def of DEFS) {
  if (!def.build) continue
  const html = renderFeaturedHtml(def.build)
  const before = current[def.id]
  next[def.id] = html
  generated++
  const status = before === html ? 'unchanged' : before ? 'updated' : 'new'
  console.log(`  ${def.id.padEnd(18)} key=${def.build.key.padEnd(9)} ${status} (${html.length} chars)`)
}

// Preserve the existing key order; only the build-having ids change value.
const ordered: Record<string, string> = {}
for (const id of Object.keys(current)) ordered[id] = next[id]

writeFileSync(jsonPath, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
console.log(`\nRegenerated ${generated} numeric featured tiles; one-line-journal left hand-authored.`)
