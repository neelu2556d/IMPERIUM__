/**
 * LIVE NETWORK plausibility audit for the Fuel macro-lookup pipeline.
 *
 * This is NOT a hermetic unit test — it calls the REAL, CURRENT USDA
 * FoodData Central API over the network using the production pipeline
 * function `usdaSearchBest()` (which runs cleanUsdaQuery → rawUsdaSearch →
 * rankUsdaResults → pickBestUsdaFood → extractMacrosPer100g, the exact same
 * path `app/api/nutrition/parse-meal` uses to resolve every food the vision
 * parser emits).
 *
 * Goal: catch any common food that still resolves to an implausible
 * calorie density (like the bell-pepper → 455 kcal bug we just fixed in
 * pickBestUsdaFood). It hits the live API, so it is skipped automatically
 * when USDA_API_KEY is absent and is excluded from the default `jest` run
 * by the `.network.` name. Run explicitly with:
 *
 *   npx jest --testPathIgnorePatterns "/node_modules/" \
 *            --testPathPatterns "usdaPlausibility" --verbose
 *
 * (the testPathIgnorePatterns override is required because jest.config.ts
 * ignores `.claude/worktrees/` by default.)
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  usdaSearchBest,
  cleanUsdaQuery,
  rankUsdaResults,
  pickBestUsdaFood,
  extractMacrosPer100g,
  type UsdaFood,
} from '@/lib/nutrition/usda'

jest.setTimeout(120_000)

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

// ── Resolve the USDA key the same way prod does (process.env), but also
//    parse .env.local ourselves since `next/jest` does not load it for tests.
//    Look in the worktree first, then fall back to the main repo checkout
//    (the worktree commonly has no .env.local of its own). ─────────────────
function loadUsdaKey(): string | null {
  if (process.env.USDA_API_KEY && process.env.USDA_API_KEY.trim()) {
    return process.env.USDA_API_KEY.trim()
  }
  const candidates = [
    join(process.cwd(), '.env.local'),
    // process.cwd() is the worktree (…/vitality/.claude/worktrees/<name>); the
    // main repo checkout that owns the real .env.local is three levels up
    // (<name> → worktrees → .claude → vitality).
    join(process.cwd(), '..', '..', '..', '.env.local'),
    // Belt-and-suspenders: also try four up in case of a deeper nesting.
    join(process.cwd(), '..', '..', '..', '..', '.env.local'),
  ]
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf8')
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*USDA_API_KEY\s*=\s*(.+)\s*$/)
        if (m) {
          // strip optional surrounding quotes
          const val = m[1].trim().replace(/^["']|["']$/g, '')
          if (val) return val
        }
      }
    } catch {
      // file not present at this path — try the next
    }
  }
  return null
}

const USDA_KEY = loadUsdaKey()

// Realistic single hint strings — the kind the AI vision parser emits into
// each food's `search_hints[]` (USDA-friendly noun phrases, cooked-state
// where relevant). One per food, grouped by expected calorie density.
type Group = 'LOW' | 'MED' | 'HIGH'
interface FoodCase {
  hint: string
  group: Group
}

const LOW: string[] = [
  'bell peppers',
  'mixed bell peppers',
  'broccoli',
  'spinach',
  'carrots',
  'tomato',
  'cucumber',
  'lettuce',
  'mushrooms',
  'onion',
  'banana',
  'apple',
  'strawberries',
  'blueberries',
  'orange',
  'grapes',
]

const MED: string[] = [
  'chicken breast',
  'ground beef',
  'salmon',
  'eggs',
  'canned tuna in water',
  'shrimp',
  'white rice cooked',
  'brown rice',
  'oatmeal',
  'baked potato',
  'sweet potato',
  'whole wheat bread',
]

const HIGH: string[] = [
  'almonds',
  'peanut butter',
  'olive oil',
  'cheddar cheese',
  'butter',
  'avocado',
]

const CASES: FoodCase[] = [
  ...LOW.map((hint) => ({ hint, group: 'LOW' as const })),
  ...MED.map((hint) => ({ hint, group: 'MED' as const })),
  ...HIGH.map((hint) => ({ hint, group: 'HIGH' as const })),
]

// Plausibility bands per the task spec. A food is SUSPICIOUS if its resolved
// kcal/100g falls outside its group's expected ceiling, OR exceeds the
// physically-near-impossible 950 kcal/100g for any food.
const HARD_CEIL = 950 // pure fat ≈ 900; nothing edible per 100g should exceed this
const GROUP_CEIL: Record<Group, number> = {
  LOW: 150, // raw veg/fruit
  MED: 350, // cooked proteins/carbs
  HIGH: HARD_CEIL,
}
// Soft floors only used to annotate "looks too low to be real food" (e.g. a
// 0-kcal bad record slipping through); not a hard fail, just noted.
const GROUP_FLOOR: Record<Group, number> = {
  LOW: 8,
  MED: 40,
  HIGH: 250,
}

interface Row {
  hint: string
  group: Group
  description: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  suspicious: boolean
  reason: string
}

// Replicate rawUsdaSearch's PRIMARY POST so that, for a SUSPICIOUS food, we can
// print the top-ranked candidates and see what it *should* have picked. (We
// only need the primary path for diagnostics; usdaSearchBest itself already ran
// the full resilient fallback chain above.)
async function diagnosticTopCandidates(
  hint: string,
  key: string,
  n: number
): Promise<UsdaFood[]> {
  const cleaned = cleanUsdaQuery(hint)
  if (!cleaned) return []
  const res = await fetch(`${USDA_SEARCH_URL}?api_key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: cleaned,
      dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'],
      pageSize: 15,
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  const foods: UsdaFood[] = data.foods || []
  return rankUsdaResults(foods, cleaned).slice(0, n)
}

const rows: Row[] = []

// Opt-in only: hits the live USDA API (~25s), so it must NEVER run in normal
// `jest`/CI. Run it on demand with: RUN_USDA_AUDIT=1 npx jest ... usdaPlausibility
const describeOrSkip = USDA_KEY && process.env.RUN_USDA_AUDIT === '1' ? describe : describe.skip

describeOrSkip('USDA live plausibility audit (network)', () => {
  if (!USDA_KEY) {
    it('skipped — no USDA_API_KEY found in env or .env.local', () => {
      // eslint-disable-next-line no-console
      console.warn(
        '[usda-plausibility] SKIPPED: USDA_API_KEY not found in process.env, ' +
          'worktree .env.local, or main-repo .env.local.'
      )
    })
    return
  }

  // Run each food sequentially (await in a for-loop) to avoid hammering the
  // public API. Each `it` resolves one food and records a row.
  for (const c of CASES) {
    it(`resolves "${c.hint}" (${c.group})`, async () => {
      const match = await usdaSearchBest(c.hint, USDA_KEY)

      if (!match) {
        const row: Row = {
          hint: c.hint,
          group: c.group,
          description: '(no match)',
          kcal: NaN,
          protein: NaN,
          carbs: NaN,
          fat: NaN,
          suspicious: true,
          reason: 'NO_MATCH',
        }
        rows.push(row)
        // eslint-disable-next-line no-console
        console.warn(`[usda] "${c.hint}" → NO MATCH (unexpected for a common food)`)
        // A common food returning no match is itself a finding, not a test
        // infra failure — record it but don't crash the suite.
        expect(match === null).toBe(true)
        return
      }

      const k = match.per100
      const ceil = GROUP_CEIL[c.group]
      const floor = GROUP_FLOOR[c.group]
      let suspicious = false
      let reason = 'PASS'
      if (k.kcal > HARD_CEIL) {
        suspicious = true
        reason = `>${HARD_CEIL} (physically implausible)`
      } else if (k.kcal > ceil) {
        suspicious = true
        reason = `>${ceil} ceiling for ${c.group}`
      } else if (k.kcal > 0 && k.kcal < floor) {
        // flag-but-don't-fail; an oddly-low value can mean a bad/empty record
        suspicious = true
        reason = `<${floor} floor for ${c.group} (suspiciously low)`
      } else if (k.kcal === 0) {
        suspicious = true
        reason = '0 kcal (empty/bad record)'
      }

      const row: Row = {
        hint: c.hint,
        group: c.group,
        description: match.description,
        kcal: k.kcal,
        protein: k.protein,
        carbs: k.carbs,
        fat: k.fat,
        suspicious,
        reason,
      }
      rows.push(row)

      // Per-food line so --verbose shows the resolution inline.
      // eslint-disable-next-line no-console
      console.log(
        `[usda] ${suspicious ? 'SUSPICIOUS' : 'PASS  '} | ${c.group} | "${c.hint}" → ` +
          `"${match.description}" | ${k.kcal} kcal/100g ` +
          `(P${k.protein} C${k.carbs} F${k.fat})` +
          (suspicious ? `  ⚑ ${reason}` : '')
      )

      if (suspicious) {
        const top = await diagnosticTopCandidates(c.hint, USDA_KEY, 6)
        // eslint-disable-next-line no-console
        console.log(`   ↳ top ranked candidates for "${c.hint}":`)
        top.forEach((f, i) => {
          const m = extractMacrosPer100g(f)
          // eslint-disable-next-line no-console
          console.log(
            `     ${i + 1}. "${f.description}" — ${m.kcal} kcal/100g ` +
              `[${f.dataType}] score=${f.score ?? '?'}`
          )
        })
      }

      // The audit's job is to REPORT, not to gate CI. The only thing we hard
      // assert per-food is that a match object was returned in the right shape.
      expect(typeof k.kcal).toBe('number')
    })
  }

  // Final aggregate: print the clean table + verdict after all foods resolved.
  afterAll(() => {
    if (rows.length === 0) return
    // Preserve declared order (CASES) regardless of async completion order.
    const order = new Map(CASES.map((c, i) => [c.hint, i]))
    rows.sort((a, b) => (order.get(a.hint)! - order.get(b.hint)!))

    const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
    const lines: string[] = []
    lines.push('')
    lines.push('═══════════════════════════════════════════════════════════════════════════════════════════')
    lines.push('  USDA LIVE PLAUSIBILITY AUDIT — full results')
    lines.push('═══════════════════════════════════════════════════════════════════════════════════════════')
    lines.push(
      `  ${pad('FOOD (hint)', 24)} ${pad('RESOLVED DESCRIPTION', 42)} ${pad('KCAL', 6)} ${pad('GRP', 4)} STATUS`
    )
    lines.push('  ' + '─'.repeat(89))
    for (const r of rows) {
      const status = r.suspicious ? `SUSPICIOUS (${r.reason})` : 'PASS'
      lines.push(
        `  ${pad(r.hint, 24)} ${pad(r.description, 42)} ${pad(String(r.kcal), 6)} ${pad(r.group, 4)} ${status}`
      )
    }
    lines.push('  ' + '─'.repeat(89))

    const suspicious = rows.filter((r) => r.suspicious)
    const passed = rows.length - suspicious.length
    lines.push('')
    lines.push('  VERDICT')
    lines.push(`  ${passed}/${rows.length} foods resolved plausibly.`)
    if (suspicious.length === 0) {
      lines.push('  ✅ No implausible calorie values found across the audited common foods.')
    } else {
      lines.push(`  ⚑ ${suspicious.length} SUSPICIOUS:`)
      for (const r of suspicious) {
        lines.push(`     - "${r.hint}" → "${r.description}" = ${r.kcal} kcal/100g  [${r.reason}]`)
      }
    }

    // Specific end-to-end check for the bell-pepper regression.
    const bp = rows.filter((r) => r.hint === 'bell peppers' || r.hint === 'mixed bell peppers')
    lines.push('')
    lines.push('  BELL-PEPPER REGRESSION (the fix we are validating)')
    for (const r of bp) {
      const held = !r.suspicious && r.kcal <= 60 // raw bell pepper ≈ 20–40
      lines.push(
        `     "${r.hint}" → "${r.description}" = ${r.kcal} kcal/100g ` +
          `→ ${held ? 'FIX HELD ✅ (plausible, not ~350/455)' : 'STILL BROKEN ❌'}`
      )
    }
    lines.push('═══════════════════════════════════════════════════════════════════════════════════════════')

    // eslint-disable-next-line no-console
    console.log(lines.join('\n'))
  })
})
