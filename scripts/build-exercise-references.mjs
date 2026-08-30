#!/usr/bin/env node
/**
 * Phase 1 — Free Exercise DB mapping for the Vitality EX dictionary.
 *
 * Fetches the public-domain exercise dataset, fuzzy-matches every Vitality
 * exercise to its best Free DB candidate, downloads the matched images into
 * /public/exercise-refs/<vitalityId>/, and writes a typed map to
 * lib/exerciseReferences.ts.
 *
 * Print contract: short summary only — totals, confidence buckets, and a
 * list of every low/unmapped entry so a human can fix the borderline cases
 * by hand. Designed to be re-runnable; existing images are skipped.
 *
 * Run from repo root:
 *   node scripts/build-exercise-references.mjs
 */

import { mkdir, writeFile, readFile, access, stat } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_CACHE = join(ROOT, 'scripts/data/free-exercise-db.json')
const DISTILLED = join(ROOT, 'scripts/data/distilled-references.json')
const SPLIT_DATA = join(ROOT, 'app/app/fitness/log/splitData.ts')
const IMAGES_DIR = join(ROOT, 'public/exercise-refs')
const OUTPUT_TS = join(ROOT, 'lib/exerciseReferences.ts')

const DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

// ────────────────────────────────────────────────────────────────────────────
// 1. Fetch (cached) dataset
// ────────────────────────────────────────────────────────────────────────────

async function loadDataset() {
  if (existsSync(DATA_CACHE)) {
    const raw = await readFile(DATA_CACHE, 'utf-8')
    return JSON.parse(raw)
  }
  console.log('• Fetching Free Exercise DB JSON (~4MB) …')
  const res = await fetch(DATASET_URL)
  if (!res.ok) throw new Error(`Failed to fetch dataset: ${res.status}`)
  const text = await res.text()
  await mkdir(dirname(DATA_CACHE), { recursive: true })
  await writeFile(DATA_CACHE, text)
  return JSON.parse(text)
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Parse Vitality EX dictionary from splitData.ts
// ────────────────────────────────────────────────────────────────────────────

async function loadVitalityExercises() {
  const src = await readFile(SPLIT_DATA, 'utf-8')
  const start = src.indexOf('export const EX:')
  if (start < 0) throw new Error('EX dictionary not found in splitData.ts')
  const body = src.slice(start, src.indexOf('}\n', start) + 1)

  // Lightweight parse — every line of the form:
  //   key: { name: 'X', tier: 'Y', ... }
  const out = []
  const re = /^\s*(\w+):\s*\{\s*name:\s*'([^']+)'\s*,\s*tier:\s*'(\w+)'/gm
  let m
  while ((m = re.exec(body)) !== null) {
    out.push({ id: m[1], name: m[2], tier: m[3] })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// 2b. Manual overrides — for exercises whose Vitality name doesn't fuzzy-
//     match well to the Free DB naming convention. Add a vitality_id → free_db_id
//     pair here and re-run the script.
// ────────────────────────────────────────────────────────────────────────────

const MANUAL_OVERRIDES = {
  dips_weighted: 'Dips_-_Triceps_Version',
  pec_deck:      'Butterfly',
  reverse_pec:   'Reverse_Machine_Flyes',
  skullcrushers: 'EZ-Bar_Skullcrusher',
  pendlay_row:   'Bent_Over_Barbell_Row',
  conv_dl:       'Barbell_Deadlift',
  toes_to_bar:   'Hanging_Pike',
  // 2026-07-01 — corrections for high-confidence MIS-MATCHES that shipped to
  // prod (the fuzzy match picked the wrong movement). Pin the right Free DB
  // source so a re-run regenerates correct images + text.
  // NOTE: db_split_squat is left unpinned — no clean Free DB dumbbell-split-squat
  // source exists; its card text is hand-corrected in lib/exerciseReferences.ts
  // pending Alex's authoritative 57-lift library regen.
  flat_db_press:    'Dumbbell_Bench_Press',
  seated_cable_row: 'Seated_Cable_Rows',
  db_lat_raise:     'Side_Lateral_Raise',
  bb_row:           'Bent_Over_Barbell_Row',
  cable_fly:        'Cable_Crossover',
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Matching
// ────────────────────────────────────────────────────────────────────────────

const ABBREV = {
  bb: 'barbell',
  db: 'dumbbell',
  ohp: 'overhead press',
  incl: 'incline',
  decl: 'decline',
  rdl: 'romanian deadlift',
  dl: 'deadlift',
  ext: 'extension',
  ss: 'split squat',
  tri: 'triceps',
  bi: 'biceps',
  oh: 'overhead',
}

function normalize(str) {
  let s = str.toLowerCase()
  // Expand abbreviations as whole tokens
  s = s.replace(/[-_]/g, ' ').replace(/[(){}\[\]]/g, ' ')
  const tokens = s.split(/\s+/).filter(Boolean).map(t => ABBREV[t] ?? t)
  return tokens.join(' ').replace(/\s+/g, ' ').trim()
}

function tokenize(str) {
  return new Set(normalize(str).split(' ').filter(t => t.length > 1))
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const t of a) if (b.has(t)) intersect++
  return intersect / (a.size + b.size - intersect)
}

/**
 * Score a Vitality exercise against a Free DB candidate.
 * Range 0..1. Combines token Jaccard with bonuses for key-equipment match.
 */
function scoreMatch(vitality, candidate) {
  const vNorm = normalize(vitality.name + ' ' + vitality.id)
  const cNorm = normalize(candidate.name)
  const vTokens = new Set(vNorm.split(' ').filter(t => t.length > 1))
  const cTokens = new Set(cNorm.split(' ').filter(t => t.length > 1))

  let s = jaccard(vTokens, cTokens)

  // Bonuses
  const equipmentTokens = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'bodyweight']
  for (const eq of equipmentTokens) {
    if (vTokens.has(eq) && cTokens.has(eq)) s += 0.08
    else if (vTokens.has(eq) && !cTokens.has(eq)) s -= 0.05
  }
  // Penalty: candidate has "pyramid" / "alternate" / "single leg" variants we
  // probably don't want unless our name explicitly says so.
  const niche = ['pyramid', 'alternating', 'iso', 'isometric', 'partial']
  for (const n of niche) {
    if (cTokens.has(n) && !vTokens.has(n)) s -= 0.1
  }
  return s
}

function pickBestMatch(vitality, dataset) {
  let best = null
  for (const cand of dataset) {
    const score = scoreMatch(vitality, cand)
    if (!best || score > best.score) best = { score, cand }
  }
  return best
}

function confidenceBucket(score) {
  if (score >= 0.55) return 'high'
  if (score >= 0.4) return 'medium'
  if (score >= 0.25) return 'low'
  return 'unmapped'
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Image download
// ────────────────────────────────────────────────────────────────────────────

async function downloadImage(url, dest) {
  if (existsSync(dest)) return { skipped: true }
  const res = await fetch(url)
  if (!res.ok) return { error: `HTTP ${res.status}` }
  await mkdir(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return { downloaded: true }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Emit lib/exerciseReferences.ts
// ────────────────────────────────────────────────────────────────────────────

function emitTypeScript(entries) {
  const header = `// AUTO-GENERATED by scripts/build-exercise-references.mjs — do not hand-edit.
// Re-run the script when EX changes in app/app/fitness/log/splitData.ts.
// Source: Free Exercise DB (https://github.com/yuhonas/free-exercise-db, public domain).

export interface ExerciseReference {
  freeDbId: string
  confidence: 'high' | 'medium' | 'low'
  images: string[]
  instructions: string[]
  primaryMuscles: string[]
  equipment: string
  // Build-time distilled summary — short, phone-readable. Optional so any
  // un-distilled entry still type-checks; the card falls back to instructions.
  gist?: string
  steps?: string[]
  cues?: string[]
}

export const exerciseReferences: Record<string, ExerciseReference> = `

  // Build a deterministic object literal (sorted keys for diff stability)
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)))
  const json = JSON.stringify(sorted, null, 2)
  return header + json + '\n'
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const dataset = await loadDataset()
  const vitality = await loadVitalityExercises()

  // Optional build-time distilled summaries (gist/steps/cues). Merged in when
  // present so a full rebuild keeps the phone-readable copy; absent is fine.
  let distilled = {}
  if (existsSync(DISTILLED)) {
    distilled = JSON.parse(await readFile(DISTILLED, 'utf-8'))
  }

  const results = []
  const refs = {}
  const dlErrors = []
  let dlTotal = 0
  let dlSkipped = 0

  for (const v of vitality) {
    let best = pickBestMatch(v, dataset)
    let conf = confidenceBucket(best.score)

    // Manual override — pin the Free DB id explicitly when the fuzzy match
    // is unreliable (e.g., "pendlay_row" → "Bent Over Barbell Row").
    if (MANUAL_OVERRIDES[v.id]) {
      const pinned = dataset.find(d => d.id === MANUAL_OVERRIDES[v.id])
      if (pinned) {
        best = { score: 1.0, cand: pinned }
        conf = 'high'
      }
    }

    results.push({ v, best, conf })
    if (conf === 'unmapped' || conf === 'low') continue

    // Download images
    const cand = best.cand
    const imageUrls = (cand.images ?? []).map(rel => `${IMAGE_BASE}/${rel}`)
    const localPaths = []
    for (let i = 0; i < Math.min(imageUrls.length, 2); i++) {
      const ext = imageUrls[i].split('.').pop() ?? 'jpg'
      const local = join(IMAGES_DIR, v.id, `${i}.${ext}`)
      const res = await downloadImage(imageUrls[i], local)
      if (res.error) dlErrors.push({ id: v.id, url: imageUrls[i], err: res.error })
      else if (res.skipped) dlSkipped++
      else dlTotal++
      localPaths.push(`/exercise-refs/${v.id}/${i}.${ext}`)
    }

    const d = distilled[v.id]
    refs[v.id] = {
      freeDbId: cand.id,
      confidence: conf,
      images: localPaths,
      instructions: cand.instructions ?? [],
      primaryMuscles: cand.primaryMuscles ?? [],
      equipment: cand.equipment ?? '',
      ...(d?.gist ? { gist: d.gist } : {}),
      ...(Array.isArray(d?.steps) ? { steps: d.steps } : {}),
      ...(Array.isArray(d?.cues) ? { cues: d.cues } : {}),
    }
  }

  await mkdir(dirname(OUTPUT_TS), { recursive: true })
  await writeFile(OUTPUT_TS, emitTypeScript(refs))

  // ── Summary ──
  const buckets = { high: 0, medium: 0, low: 0, unmapped: 0 }
  for (const r of results) buckets[r.conf]++

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Vitality EX dictionary: ${vitality.length} exercises`)
  console.log(`  high   : ${buckets.high}`)
  console.log(`  medium : ${buckets.medium}`)
  console.log(`  low    : ${buckets.low}      (review by hand)`)
  console.log(`  none   : ${buckets.unmapped} (review by hand)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Images downloaded : ${dlTotal} new, ${dlSkipped} skipped (already on disk)`)
  if (dlErrors.length) {
    console.log(`Image errors      : ${dlErrors.length}`)
    for (const e of dlErrors.slice(0, 10)) console.log(`  ! ${e.id} — ${e.err} ${e.url}`)
    if (dlErrors.length > 10) console.log(`  … +${dlErrors.length - 10} more`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // List low + unmapped for human review
  const needsReview = results.filter(r => r.conf === 'low' || r.conf === 'unmapped')
  if (needsReview.length) {
    console.log(`\nNeeds human review (${needsReview.length}):\n`)
    for (const r of needsReview) {
      const bestName = r.best?.cand?.name ?? '(no candidate)'
      const score = r.best?.score?.toFixed(2) ?? '—'
      console.log(`  ${r.conf.padEnd(8)} ${r.v.id.padEnd(20)} ${r.v.name.padEnd(28)} → ${bestName.padEnd(40)} (${score})`)
    }
  }
  console.log(`\nOutput: ${OUTPUT_TS}`)
  console.log(`Images: ${IMAGES_DIR}/<vitalityId>/*.jpg`)
}

main().catch(e => { console.error(e); process.exit(1) })
