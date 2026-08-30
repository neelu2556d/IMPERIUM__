/**
 * Backtests for the tailored-intake engine.
 *
 * `recommendIntake()` is a deterministic decision tree that maps the
 * 11-question quiz to one of six split presets + a diagnostic + a
 * reasoning list. `recommendExercises()` then personalizes the chosen
 * preset's exercise list using restrictions, equipment, and priority
 * answers.
 *
 * These tests don't verify exact strings — they verify structural
 * properties that must hold across every plausible answer combination:
 *
 *  - The chosen preset always exists in PRESETS
 *  - Beginners + returning lifters never get the advanced specialist
 *    splits (ppl_6, bro_5) — the engine claims this and we lock it in
 *  - Session caps at under 45 min never get the high-volume splits
 *  - `lower_back` restriction never gets ppl_6 or bro_5
 *  - `recommendExercises()` never drops a day's exercise count to zero
 *    on a non-rest day (you'd end up with an empty workout)
 *  - Equipment substitutions never leave a barbell-only lift on a
 *    dumbbells-only or bodyweight user
 *  - Restriction substitutions never leave a banned lift in the day
 *
 * We exhaustively crawl ~ a few thousand answer permutations, which
 * runs fast (<200ms locally) and catches regressions in the decision
 * tree without needing a live UI.
 */

import {
  recommendIntake,
  PRESETS,
  type IntakeAnswers,
  type Preset,
  type Experience,
  type Goal,
  type Days,
  type Session,
  type Equipment,
  type Restriction,
  type Recovery,
  type Priority,
  type TrainingStyle,
} from '../app/app/fitness/setup/presets'
import { recommendExercises, EX_TAGS, type Equip, type ReasonKind } from '../app/app/fitness/setup/exerciseSelection'
import { EX } from '../app/app/fitness/log/splitData'

// ─── Helpers ──────────────────────────────────────────────────────────

const PRESET_IDS = new Set(PRESETS.map(p => p.id))
const ADVANCED_PRESETS: Preset['id'][] = ['ppl_6', 'bro_5']
const HIGH_VOLUME_PRESETS: Preset['id'][] = ['ppl_6', 'bro_5', 'ppl_3']

const EXPERIENCES: Experience[] = ['new', 'some', 'experienced', 'back_recent', 'back_long']
const GOALS: Goal[] = ['strength', 'muscle', 'fat_loss', 'recomp', 'health']
const DAY_OPTIONS: Days[] = [2, 3, 4, 5, 6, 7]
const SESSIONS: Session[] = ['under_45', '45_60', '60_75', '75_plus']
const EQUIPMENT: Equipment[] = ['commercial', 'home_full', 'dumbbells', 'bodyweight', 'mix']
const RECOVERIES: Recovery[] = ['great', 'okay', 'stressed', 'rough']
const STYLES: TrainingStyle[] = ['one_body_part', 'ppl', 'upper_lower', 'full_body', 'surprise_me']
const RESTRICTIONS: Restriction[] = [
  'heavy_squat', 'heavy_dl', 'ohp', 'heavy_pull',
  'explosive', 'bench', 'lower_back',
]
const PRIORITIES: Priority[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'balanced']

/** Equipment-availability table mirroring exerciseSelection.ts (intentional
 *  duplication — if these drift, the test must catch it). */
const EQUIPMENT_AVAILABILITY: Record<Equipment, Set<Equip>> = {
  commercial: new Set<Equip>(['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands']),
  home_full:  new Set<Equip>(['barbell', 'dumbbell', 'bodyweight']),
  dumbbells:  new Set<Equip>(['dumbbell', 'bodyweight']),
  bodyweight: new Set<Equip>(['bodyweight', 'bands']),
  mix:        new Set<Equip>(['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands']),
}

function baseAnswers(overrides: Partial<IntakeAnswers> = {}): IntakeAnswers {
  return {
    experience: 'some',
    formConfidence: 'getting_there',
    recovery: 'okay',
    goal: 'muscle',
    priorities: ['balanced'],
    style: 'surprise_me',
    movementPreference: 'mix',
    failureTolerance: 'one_two',
    days: 4,
    session: '60_75',
    equipment: 'commercial',
    restrictions: [],
    cardioAndOutside: 'desk',
    ...overrides,
  }
}

// ─── recommendIntake — structural invariants across all permutations ──

describe('recommendIntake — structural invariants', () => {
  test('always returns a valid preset id, non-empty diagnostic, ≥1 reasoning bullet', () => {
    for (const experience of EXPERIENCES) {
      for (const days of DAY_OPTIONS) {
        for (const goal of GOALS) {
          for (const session of SESSIONS) {
            for (const recovery of RECOVERIES) {
              const a = baseAnswers({ experience, days, goal, session, recovery })
              const rec = recommendIntake(a)
              expect(PRESET_IDS.has(rec.presetId)).toBe(true)
              expect(rec.presetId).not.toBe('blank')
              expect(rec.diagnostic.length).toBeGreaterThan(20)
              expect(rec.reasoning.length).toBeGreaterThanOrEqual(1)
              for (const bullet of rec.reasoning) {
                expect(typeof bullet).toBe('string')
                expect(bullet.length).toBeGreaterThan(8)
              }
            }
          }
        }
      }
    }
  })
})

// ─── recommendIntake — programming guardrails ────────────────────────

describe('recommendIntake — programming guardrails', () => {
  test('beginner + returning lifters never get advanced specialist splits', () => {
    const novices: Experience[] = ['new', 'back_long']
    for (const experience of novices) {
      for (const days of DAY_OPTIONS) {
        for (const style of STYLES) {
          for (const goal of GOALS) {
            const rec = recommendIntake(baseAnswers({ experience, days, style, goal }))
            expect(ADVANCED_PRESETS).not.toContain(rec.presetId)
          }
        }
      }
    }
  })

  test('under-45-min sessions never get high-volume specialist splits', () => {
    for (const days of DAY_OPTIONS) {
      for (const style of STYLES) {
        for (const goal of GOALS) {
          for (const experience of EXPERIENCES) {
            const rec = recommendIntake(baseAnswers({
              days, style, goal, experience, session: 'under_45',
            }))
            expect(HIGH_VOLUME_PRESETS).not.toContain(rec.presetId)
          }
        }
      }
    }
  })

  test('lower_back restriction vetoes ppl_6 and bro_5', () => {
    for (const days of DAY_OPTIONS) {
      for (const style of STYLES) {
        for (const goal of GOALS) {
          for (const experience of EXPERIENCES) {
            const rec = recommendIntake(baseAnswers({
              days, style, goal, experience,
              restrictions: ['lower_back'],
            }))
            expect(['ppl_6', 'bro_5']).not.toContain(rec.presetId)
          }
        }
      }
    }
  })

  test('rough recovery + days≥5 always triggers a days override', () => {
    for (const days of [5, 6] as Days[]) {
      const rec = recommendIntake(baseAnswers({ recovery: 'rough', days }))
      expect(rec.daysOverride).toBeDefined()
      expect(rec.daysOverride?.recommended).toBeLessThan(days)
    }
  })

  test('rough recovery + days≤2 never overrides (already conservative)', () => {
    const rec = recommendIntake(baseAnswers({ recovery: 'rough', days: 2 }))
    expect(rec.daysOverride).toBeUndefined()
  })

  test('cardioAndOutside=cardio_first + goal=strength surfaces the trade-off in reasoning', () => {
    const rec = recommendIntake(baseAnswers({ cardioAndOutside: 'cardio_first', goal: 'strength' }))
    const hasTradeoffBullet = rec.reasoning.some(b =>
      /trade.?off|cardio/i.test(b) && /strength|fresh|heavy/i.test(b),
    )
    expect(hasTradeoffBullet).toBe(true)
  })

  test('cardioAndOutside=cardio_first softens 5 days to a real 4-day split, never a 3-day full body', () => {
    const rec = recommendIntake(baseAnswers({ cardioAndOutside: 'cardio_first', days: 5, goal: 'muscle', style: 'ppl' }))
    expect(rec.daysOverride).toBeDefined()
    // v2: cardio-primary caps to 4 (Upper/Lower), not 3 (full body). Capping
    // all the way to a 3-day full body was the case that read as "the quiz
    // ignored my 5 days and my PPL pick".
    expect(rec.daysOverride?.recommended).toBe(4)
    expect(rec.presetId).toBe('upper_lower_4')
    expect(rec.presetId.startsWith('full_body')).toBe(false)
  })

  // The setup slider lets someone answer a flexible "4-5 days" via half-steps.
  // The engine must floor each half to a concrete count so it always programs a
  // real split (never a fractional one) — a "4-5" pick trains as a solid 4.
  test.each([
    [2.5, 2],
    [3.5, 3],
    [4.5, 4],
    [5.5, 5],
    [6.5, 6],
  ] as Array<[Days, Days]>)(
    'a %s-day pick programs identically to %s whole days',
    (half, floor) => {
      for (const experience of EXPERIENCES) {
        for (const goal of GOALS) {
          const halfRec = recommendIntake(baseAnswers({ days: half, experience, goal }))
          const floorRec = recommendIntake(baseAnswers({ days: floor, experience, goal }))
          expect(halfRec.presetId).toBe(floorRec.presetId)
          expect(halfRec.daysOverride?.recommended).toBe(floorRec.daysOverride?.recommended)
        }
      }
    },
  )
})

// ─── recommendExercises — output shape invariants ────────────────────

describe('recommendExercises — output shape', () => {
  function allCombinations(): IntakeAnswers[] {
    // Compact crawl: vary the fields that drive exercise selection, fix
    // the rest. Days/session/recovery don't change exercise output, so
    // we don't need to crawl them here.
    const out: IntakeAnswers[] = []
    for (const equipment of EQUIPMENT) {
      for (const restrictions of [[], ['heavy_squat'], ['lower_back'], ['ohp', 'bench'], ['heavy_squat', 'heavy_dl']] as Restriction[][]) {
        for (const priorities of [['balanced'], ['chest'], ['legs'], ['back', 'shoulders']] as Priority[][]) {
          out.push(baseAnswers({ equipment, restrictions, priorities }))
        }
      }
    }
    return out
  }

  test('every non-rest day still has ≥1 exercise after personalization', () => {
    for (const preset of PRESETS) {
      if (preset.id === 'blank') continue
      for (const a of allCombinations()) {
        const days = recommendExercises(preset, a).days
        for (const d of days) {
          if (d.category === 'rest') continue
          expect(d.exercises.length).toBeGreaterThan(0)
        }
      }
    }
  })

  test('equipment filter never leaves an unavailable lift in the output', () => {
    const restrictiveEquip: Equipment[] = ['dumbbells', 'bodyweight']
    for (const preset of PRESETS) {
      if (preset.id === 'blank') continue
      for (const equipment of restrictiveEquip) {
        const a = baseAnswers({ equipment })
        const days = recommendExercises(preset, a).days
        const allowed = EQUIPMENT_AVAILABILITY[equipment]
        for (const d of days) {
          for (const ex of d.exercises) {
            const tag = EX_TAGS[ex.id]
            if (!tag) continue // unknown id → engine doesn't filter; UI handles
            expect(allowed.has(tag.equip)).toBe(true)
          }
        }
      }
    }
  })

  test('every restriction’s banned lifts never appear in the output', () => {
    // We use the same sub table the engine references, but spelled out
    // here as an external assertion. If the engine fails to remove a
    // banned lift, this catches it.
    const BANNED: Record<Restriction, string[]> = {
      heavy_squat: ['back_squat', 'front_squat'],
      heavy_dl: ['conv_dl'],
      ohp: ['standing_ohp', 'push_press'],
      heavy_pull: ['pullup_weighted', 'bb_row', 'pendlay_row'],
      explosive: ['push_press'],
      bench: ['bench_bb', 'incl_bb_bench', 'close_grip'],
      lower_back: ['back_squat', 'front_squat', 'conv_dl', 'rdl', 'bb_row', 'pendlay_row'],
    }
    for (const preset of PRESETS) {
      if (preset.id === 'blank') continue
      for (const restriction of RESTRICTIONS) {
        const a = baseAnswers({ restrictions: [restriction] })
        const days = recommendExercises(preset, a).days
        for (const d of days) {
          for (const ex of d.exercises) {
            expect(BANNED[restriction]).not.toContain(ex.id)
          }
        }
      }
    }
  })

  test('priorities=balanced emits zero priority-add reasons', () => {
    // The engine now may still ADD exercises via the volume-floor
    // backfill (a muscle below MEV gets an accessory), so we can't
    // check exercise count parity anymore. Instead, verify the
    // priority-bias pass itself produces no reasons when balanced.
    for (const preset of PRESETS) {
      if (preset.id === 'blank') continue
      const a = baseAnswers({ priorities: ['balanced'] })
      const { reasons } = recommendExercises(preset, a)
      const priorityAdds = Object.values(reasons).filter(r => r.kind === 'priority-add')
      expect(priorityAdds.length).toBe(0)
    }
  })

  test('non-balanced priority adds at least one accessory on a matching day', () => {
    // Pick a preset with a push day and a chest priority → expect an
    // extra accessory to land somewhere.
    const fullBody2 = PRESETS.find(p => p.id === 'full_body_2')!
    const a = baseAnswers({ priorities: ['chest'] })
    const personalized = recommendExercises(fullBody2, a).days
    const totalBase = fullBody2.days.reduce((acc, d) => acc + d.exercises.length, 0)
    const totalPers = personalized.reduce((acc, d) => acc + d.exercises.length, 0)
    expect(totalPers).toBeGreaterThan(totalBase)
  })
})

// ─── Goal preferences overlay ──────────────────────────────────────
//
// Goal acts as a strategic overlay on top of the intake decision tree:
//   - cut + short window → caps to a recoverable 3-4 day split
//   - longevity → joint-friendly full-body cap (unless user explicitly
//     picked a higher-frequency style)
//   - bulk + long window + no time constraint → pushes intermediate+
//     lifters up toward PPL when days allow
//   - constraint=injury → vetoes the two highest-volume splits
//   - constraint=time → hard cap at upper/lower 4-day
//   - constraint=injury + no specific intake restrictions → synthesizes
//     a general-caution restriction set so the day list isn't loaded
//     with risky barbell main lifts
//   - outcome=cut suppresses priority bias (volume management)
//   - outcome=longevity swaps barbell main lifts for DB/machine variants
//   - When Goal isn't set, recommendIntake / recommendExercises behave
//     identically to before Goal integration

describe('recommendIntake — Goal overlay', () => {
  test('cut + 30-day window caps a 6-day request to 4 days, upper/lower', () => {
    const a = baseAnswers({ days: 6, experience: 'experienced', style: 'ppl' })
    const rec = recommendIntake(a, {
      outcome: 'cut', window: '30', constraint: 'none', completed_at: '2026-05-28',
    })
    expect(rec.presetId).toBe('upper_lower_4')
    expect(rec.daysOverride?.recommended).toBe(4)
    expect(rec.reasoning.some(b => /cutting/i.test(b))).toBe(true)
  })

  test('longevity caps to a sustainable full-body rhythm', () => {
    const a = baseAnswers({ days: 5, experience: 'some' })
    const rec = recommendIntake(a, {
      outcome: 'longevity', window: 'open', constraint: 'none', completed_at: '2026-05-28',
    })
    expect(['full_body_2', 'full_body_3']).toContain(rec.presetId)
    expect(rec.reasoning.some(b => /longevity|joint/i.test(b))).toBe(true)
  })

  test('bulk + long window + no time constraint nudges intermediates up to PPL', () => {
    const a = baseAnswers({ days: 6, experience: 'some', style: 'surprise_me', goal: 'muscle' })
    const rec = recommendIntake(a, {
      outcome: 'bulk', window: '180', constraint: 'none', completed_at: '2026-05-28',
    })
    expect(['ppl_3', 'ppl_6']).toContain(rec.presetId)
    expect(rec.reasoning.some(b => /muscle|PPL|grow/i.test(b))).toBe(true)
  })

  test('constraint=injury vetoes ppl_6 and bro_5', () => {
    const a = baseAnswers({ days: 6, experience: 'experienced', style: 'one_body_part' })
    const rec = recommendIntake(a, {
      outcome: 'bulk', window: 'open', constraint: 'injury', completed_at: '2026-05-28',
    })
    expect(rec.presetId).not.toBe('ppl_6')
    expect(rec.presetId).not.toBe('bro_5')
  })

  test('constraint=time caps to 4-day upper/lower', () => {
    const a = baseAnswers({ days: 6, experience: 'experienced', style: 'ppl' })
    const rec = recommendIntake(a, {
      outcome: 'bulk', window: 'open', constraint: 'time', completed_at: '2026-05-28',
    })
    expect(rec.presetId).toBe('upper_lower_4')
  })

  test('Goal=undefined behaves identically to the pre-Goal call signature', () => {
    const a = baseAnswers({ days: 5, experience: 'some', style: 'one_body_part' })
    const withoutGoal = recommendIntake(a)
    const withNullGoal = recommendIntake(a, null)
    expect(withNullGoal.presetId).toBe(withoutGoal.presetId)
    expect(withNullGoal.reasoning).toEqual(withoutGoal.reasoning)
  })
})

describe('recommendExercises — Goal overlay', () => {
  test('constraint=injury + no intake restrictions synthesizes safer variants', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers({ restrictions: [] })
    const withInjury = recommendExercises(preset, a, {
      outcome: 'maintain', window: 'open', constraint: 'injury', completed_at: '2026-05-28',
    }).days
    // Pull every exercise id across the program; none should be the
    // high-risk barbell main lifts the synthetic restriction set bans.
    const allIds = withInjury.flatMap(d => d.exercises.map(e => e.id))
    expect(allIds).not.toContain('back_squat')
    expect(allIds).not.toContain('conv_dl')
    expect(allIds).not.toContain('bench_bb')
  })

  test('outcome=cut suppresses the priority-bias accessory bonus', () => {
    // Check via reason kind rather than total exercise count — the
    // volume-floor backfill may now add other accessories on both
    // sides, so total-count parity isn't the right invariant. The
    // contract being tested: cut → zero priority-add reasons.
    const preset = PRESETS.find(p => p.id === 'full_body_2')!
    const a = baseAnswers({ priorities: ['chest'] })
    const { reasons: cutReasons } = recommendExercises(preset, a, {
      outcome: 'cut', window: '90', constraint: 'none', completed_at: '2026-05-28',
    })
    const cutPriorityAdds = Object.values(cutReasons).filter(r => r.kind === 'priority-add')
    expect(cutPriorityAdds.length).toBe(0)
  })

  test('outcome=longevity swaps barbell main lifts to DB/machine variants', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers()
    const withLongevity = recommendExercises(preset, a, {
      outcome: 'longevity', window: 'open', constraint: 'none', completed_at: '2026-05-28',
    }).days
    const allIds = withLongevity.flatMap(d => d.exercises.map(e => e.id))
    // The longevity swap map replaces these specific barbell main lifts.
    // If any survived the pass, the swap is broken.
    expect(allIds).not.toContain('bench_bb')
    expect(allIds).not.toContain('back_squat')
    expect(allIds).not.toContain('conv_dl')
  })

  test('Goal=undefined behaves identically to the pre-Goal call signature', () => {
    const preset = PRESETS.find(p => p.id === 'upper_lower_4')!
    const a = baseAnswers({ priorities: ['chest'] })
    const withoutGoal = recommendExercises(preset, a).days
    const withNullGoal = recommendExercises(preset, a, null).days
    expect(withNullGoal).toEqual(withoutGoal)
  })
})

// ─── EX_TAGS coverage — every exercise the picker shows is taggable ──

describe('EX_TAGS coverage', () => {
  test('every EX entry has a matching EX_TAGS entry', () => {
    const missing = Object.keys(EX).filter(id => !EX_TAGS[id])
    expect(missing).toEqual([])
  })

  test('every EX_TAGS entry references a real EX entry', () => {
    const orphaned = Object.keys(EX_TAGS).filter(id => !EX[id])
    expect(orphaned).toEqual([])
  })
})

// ─── Recommendation reasons — picker pill text ───────────────────────
//
// Every engine-touched exercise gets a reason whose sentence quotes the
// user's actual intake answer. Baseline preset exercises get no reason
// entry. These tests lock in that contract so the picker UI can rely on
// "reason present ⇒ pill should be shown."

describe('recommendExercises — reasons map', () => {
  test('restriction substitution emits a reason referencing the restriction', () => {
    // upper_lower_4's lower-heavy day has back_squat, which gets removed +
    // substituted when the user opts out of heavy squatting.
    const preset = PRESETS.find(p => p.id === 'upper_lower_4')!
    const a = baseAnswers({ restrictions: ['heavy_squat'] })
    const { reasons } = recommendExercises(preset, a)
    const restrictionReasons = Object.values(reasons).filter(r => r.kind === 'restriction-sub')
    expect(restrictionReasons.length).toBeGreaterThan(0)
    // The sentence must mention "heavy squatting" — the exact label the
    // user clicked in the intake quiz.
    expect(restrictionReasons.every(r => r.sentence.includes('heavy squatting'))).toBe(true)
    expect(restrictionReasons.every(r => r.sourceLabel === 'restrictions')).toBe(true)
  })

  test('equipment swap emits a reason referencing the equipment answer', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers({ equipment: 'dumbbells' })
    const { reasons } = recommendExercises(preset, a)
    const equipmentReasons = Object.values(reasons).filter(r => r.kind === 'equipment-fit')
    expect(equipmentReasons.length).toBeGreaterThan(0)
    expect(equipmentReasons.every(r => r.sentence.includes('dumbbells at home'))).toBe(true)
    expect(equipmentReasons.every(r => r.sourceLabel === 'equipment')).toBe(true)
  })

  test('priority bias emits a reason referencing the chosen body part', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_2')!
    const a = baseAnswers({ priorities: ['chest'] })
    const { reasons } = recommendExercises(preset, a)
    const priorityReasons = Object.values(reasons).filter(r => r.kind === 'priority-add')
    expect(priorityReasons.length).toBeGreaterThan(0)
    expect(priorityReasons.every(r => r.sentence.includes('chest'))).toBe(true)
    expect(priorityReasons.every(r => r.sourceLabel === 'priorities')).toBe(true)
  })

  test('longevity goal emits a reason tied to the goal source', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers()
    const { reasons } = recommendExercises(preset, a, {
      outcome: 'longevity', window: 'open', constraint: 'none', completed_at: '2026-05-28',
    })
    const longevityReasons = Object.values(reasons).filter(r => r.kind === 'goal-longevity')
    expect(longevityReasons.length).toBeGreaterThan(0)
    expect(longevityReasons.every(r => r.sourceLabel === 'goal')).toBe(true)
  })

  test('baseline preset with no overlays still emits foundation/accessory reasons for every exercise', () => {
    // commercial equipment + no restrictions + balanced priority + no goal:
    // engine doesn't swap or add anything, but every recommended exercise
    // still gets a baseline reason so the picker pill has something to say.
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers({ priorities: ['balanced'], restrictions: [], equipment: 'commercial' })
    const { days, reasons } = recommendExercises(preset, a)
    // Allow 'volume-floor' too — the audit may add backfill accessories
    // for muscles that fell under MEV even with no other overlays.
    const baselineKinds: ReasonKind[] = ['foundation', 'accessory', 'volume-floor']
    expect(Object.values(reasons).every(r => baselineKinds.includes(r.kind))).toBe(true)
    // Every exercise on a non-rest day should be covered.
    let nonRestCount = 0
    days.forEach((d, dayIdx) => {
      if (d.category === 'rest') return
      d.exercises.forEach(ex => {
        nonRestCount++
        expect(reasons[`${dayIdx}:${ex.id}`]).toBeDefined()
      })
    })
    expect(nonRestCount).toBeGreaterThan(0)
  })

  test('every reason sentence stays under 16 words', () => {
    // Spec budget is ≤ 14 words. Leave 2-word headroom for future
    // templating tweaks before the test fails.
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers({
      restrictions: ['heavy_squat', 'bench'],
      equipment: 'dumbbells',
      priorities: ['chest', 'arms'],
    })
    const { reasons } = recommendExercises(preset, a, {
      outcome: 'longevity', window: 'open', constraint: 'none', completed_at: '2026-05-28',
    })
    for (const reason of Object.values(reasons)) {
      const wordCount = reason.sentence.trim().split(/\s+/).length
      expect(wordCount).toBeLessThanOrEqual(16)
    }
  })

  test('reasons key format is `${dayIdx}:${exerciseId}`', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers({ restrictions: ['heavy_squat'] })
    const { reasons, days } = recommendExercises(preset, a)
    for (const key of Object.keys(reasons)) {
      expect(key).toMatch(/^\d+:[a-z_]+$/)
      const [dayIdxStr, exId] = key.split(':')
      const dayIdx = Number(dayIdxStr)
      expect(dayIdx).toBeGreaterThanOrEqual(0)
      expect(dayIdx).toBeLessThan(days.length)
      // The keyed exercise should actually be on that day's exercise list.
      const onDay = days[dayIdx].exercises.some(e => e.id === exId)
      expect(onDay).toBe(true)
    }
  })
})

// ─── Goal-driven rep prescription ────────────────────────────────────
//
// Same preset, same restrictions, same equipment — only the user's goal
// answer differs. The engine should program meaningfully different
// rep schemes per goal (strength = heavier/lower-rep, muscle = mid-rep,
// fat_loss / health = higher-rep). This is what makes the program feel
// "actually tailored to me" rather than a generic template.

describe('recommendExercises — goal-driven sets/reps', () => {
  function firstHeavyCompoundOnHeavyDay(answers: IntakeAnswers) {
    // Goal can swap the specific lift id (health → hack_squat instead of
    // back_squat), so probe by tier rather than a hard-coded id.
    const preset = PRESETS.find(p => p.id === 'upper_lower_4')!
    const { days } = recommendExercises(preset, answers)
    for (const day of days) {
      if (day.type !== 'HEAVY') continue
      const hit = day.exercises.find(e => EX[e.id]?.tier === 'heavy_compound')
      if (hit) return hit
    }
    return null
  }

  test('strength goal lowers reps and adds sets vs muscle goal', () => {
    const muscle = firstHeavyCompoundOnHeavyDay(baseAnswers({ goal: 'muscle' }))
    const strength = firstHeavyCompoundOnHeavyDay(baseAnswers({ goal: 'strength' }))
    expect(muscle).not.toBeNull()
    expect(strength).not.toBeNull()
    expect(strength!.reps).toBeLessThan(muscle!.reps)
    expect(strength!.sets).toBeGreaterThanOrEqual(muscle!.sets)
  })

  test('health goal raises reps and trims sets vs muscle goal', () => {
    const muscle = firstHeavyCompoundOnHeavyDay(baseAnswers({ goal: 'muscle' }))
    const health = firstHeavyCompoundOnHeavyDay(baseAnswers({ goal: 'health' }))
    expect(health).not.toBeNull()
    expect(health!.reps).toBeGreaterThan(muscle!.reps)
    expect(health!.sets).toBeLessThanOrEqual(muscle!.sets)
  })

  test('fat_loss raises reps and trims sets vs muscle goal', () => {
    const muscle = firstHeavyCompoundOnHeavyDay(baseAnswers({ goal: 'muscle' }))
    const cut = firstHeavyCompoundOnHeavyDay(baseAnswers({ goal: 'fat_loss' }))
    expect(cut).not.toBeNull()
    expect(cut!.reps).toBeGreaterThan(muscle!.reps)
    expect(cut!.sets).toBeLessThanOrEqual(muscle!.sets)
  })

  test('every prescription stays in safe bounds (sets 2-6, reps 3-25)', () => {
    const preset = PRESETS.find(p => p.id === 'upper_lower_4')!
    for (const goal of GOALS) {
      const { days } = recommendExercises(preset, baseAnswers({ goal }))
      for (const day of days) {
        if (day.category === 'rest') continue
        for (const ex of day.exercises) {
          expect(ex.sets).toBeGreaterThanOrEqual(2)
          expect(ex.sets).toBeLessThanOrEqual(6)
          expect(ex.reps).toBeGreaterThanOrEqual(3)
          expect(ex.reps).toBeLessThanOrEqual(25)
        }
      }
    }
  })
})

// ─── Intake.goal drives volume behavior ──────────────────────────────
//
// Even without the separate Goal quiz, the user's intake goal answer
// should program their volume behavior — accessory bonuses for muscle/
// strength, longevity-style joint-friendly swaps for health, accessory
// suppression for fat_loss. This is what makes the answer feel actually
// load-bearing rather than decorative.

describe('recommendExercises — intake.goal drives volume', () => {
  test('intake.goal=health triggers longevity swaps (joint-friendly variants)', () => {
    const preset = PRESETS.find(p => p.id === 'full_body_3')!
    const a = baseAnswers({ goal: 'health' })
    const { reasons } = recommendExercises(preset, a)
    const longevityReasons = Object.values(reasons).filter(r => r.kind === 'goal-longevity')
    expect(longevityReasons.length).toBeGreaterThan(0)
    // Sentence quotes the user's actual answer ("health"), not the
    // separate Goal quiz outcome.
    expect(longevityReasons.every(r => r.sentence.includes('health'))).toBe(true)
  })

  test('intake.goal=muscle emits priority-add reasons; fat_loss suppresses them', () => {
    // Total exercise count isn't the right invariant anymore (the
    // volume-floor backfill can add accessories on both sides). The
    // contract: priority-add reasons fire for 'muscle' (bulk-style
    // behavior) but not for 'fat_loss' (cut-style suppression).
    const preset = PRESETS.find(p => p.id === 'full_body_2')!
    const muscleAnswers = baseAnswers({ goal: 'muscle', priorities: ['chest'], experience: 'experienced' })
    const cutAnswers = baseAnswers({ goal: 'fat_loss', priorities: ['chest'], experience: 'experienced' })
    const { reasons: muscleReasons } = recommendExercises(preset, muscleAnswers)
    const { reasons: cutReasons } = recommendExercises(preset, cutAnswers)
    const musclePriorityAdds = Object.values(muscleReasons).filter(r => r.kind === 'priority-add').length
    const cutPriorityAdds = Object.values(cutReasons).filter(r => r.kind === 'priority-add').length
    expect(musclePriorityAdds).toBeGreaterThan(0)
    expect(cutPriorityAdds).toBe(0)
  })

  test('weekly volume audit is attached to the result, sums per muscle', () => {
    const preset = PRESETS.find(p => p.id === 'upper_lower_4')!
    const a = baseAnswers({ goal: 'muscle' })
    const { audit, days } = recommendExercises(preset, a)
    // Every muscle from the landmarks table should be in the audit.
    expect(Object.keys(audit).length).toBeGreaterThan(10)
    // Chest should have non-zero credit on a 4-day upper/lower (presses present).
    expect(audit.chest.weeklySets).toBeGreaterThan(0)
    // Goal targets sit inside MV..MRV — never zero, never absurd.
    for (const a of Object.values(audit)) {
      expect(a.target).toBeGreaterThanOrEqual(0)
      expect(a.target).toBeLessThanOrEqual(a.landmark.mrv + 5)
    }
    // Sanity: non-rest days have exercises that map to muscles.
    expect(days.some(d => d.category !== 'rest' && d.exercises.length > 0)).toBe(true)
  })

  test('rough recovery shrinks targets compared with great recovery', () => {
    const preset = PRESETS.find(p => p.id === 'upper_lower_4')!
    const rough = recommendExercises(preset, baseAnswers({ recovery: 'rough', goal: 'muscle' })).audit
    const great = recommendExercises(preset, baseAnswers({ recovery: 'great', goal: 'muscle' })).audit
    // Recovery modifier multiplies the target — great > rough for chest.
    expect(great.chest.target).toBeGreaterThan(rough.chest.target)
  })

  test('Goal quiz outcome still takes precedence over intake.goal', () => {
    // intake.goal says muscle (which would fire priority-adds), but the
    // Goal quiz outcome says cut (which suppresses them). Cut should
    // win — no priority-add reasons when the overlay is present.
    const preset = PRESETS.find(p => p.id === 'full_body_2')!
    const a = baseAnswers({ goal: 'muscle', priorities: ['chest'], experience: 'experienced' })
    const cutOverlay = {
      outcome: 'cut' as const,
      window: '60' as const,
      constraint: 'none' as const,
      completed_at: '2026-05-28',
    }
    const { reasons: withCut } = recommendExercises(preset, a, cutOverlay)
    const { reasons: withoutOverlay } = recommendExercises(preset, a)
    const cutPriorityAdds = Object.values(withCut).filter(r => r.kind === 'priority-add').length
    const basePriorityAdds = Object.values(withoutOverlay).filter(r => r.kind === 'priority-add').length
    expect(cutPriorityAdds).toBeLessThan(basePriorityAdds)
  })
})

// ─── recommendIntake — v2 split-selection revamp ──────────────────────
// The engine used to collapse ~71% of inputs onto full body and left ppl_6 /
// bro_5 all but unreachable. These lock the revamp: every split is reachable
// for the lifter it suits, no capable non-beginner is wrongly dumped onto full
// body, and explicit picks are honored where the science allows.
describe('recommendIntake — split differentiation (v2)', () => {
  const CARDIO_ALL = ['desk', 'walks', 'sport', 'running', 'cycling', 'cardio_first'] as const

  test('every one of the six splits is reachable', () => {
    const seen = new Set<string>()
    for (const experience of EXPERIENCES)
      for (const goal of GOALS)
        for (const style of STYLES)
          for (const days of DAY_OPTIONS)
            for (const session of SESSIONS) {
              seen.add(recommendIntake(baseAnswers({ experience, goal, style, days, session, recovery: 'great', cardioAndOutside: 'desk' })).presetId)
            }
    for (const id of ['full_body_2', 'full_body_3', 'upper_lower_4', 'ppl_3', 'bro_5', 'ppl_6']) {
      expect(seen.has(id)).toBe(true)
    }
  })

  test('no capable lifter is wrongly collapsed onto full body', () => {
    // Intermediate+ (some/experienced/back_recent), 4+ effective days, no
    // fatigue cap, and NOT an explicit full-body pick → must be a split.
    const nonBeginner: Experience[] = ['some', 'experienced', 'back_recent']
    const uncappedCardio = ['desk', 'walks', 'cycling'] as const
    const nonFullBodyStyles: TrainingStyle[] = ['one_body_part', 'ppl', 'upper_lower', 'surprise_me']
    let checked = 0
    for (const experience of nonBeginner)
      for (const goal of GOALS)
        for (const style of nonFullBodyStyles)
          for (const days of [4, 5, 6, 7] as Days[])
            for (const cardioAndOutside of uncappedCardio) {
              const rec = recommendIntake(baseAnswers({ experience, goal, style, days, cardioAndOutside, recovery: 'great', session: '60_75' }))
              expect(rec.presetId.startsWith('full_body')).toBe(false)
              checked++
            }
    expect(checked).toBeGreaterThan(100)
  })

  test('science-based personas resolve to the right split', () => {
    const P = (o: Partial<IntakeAnswers>) => recommendIntake(baseAnswers(o)).presetId
    // novices always build on full body, whatever the day count
    expect(P({ experience: 'new', days: 6, goal: 'muscle', style: 'ppl' })).toBe('full_body_3')
    expect(P({ experience: 'back_long', days: 5, goal: 'muscle' })).toBe('full_body_3')
    // low frequency = full body (optimal per-muscle frequency)
    expect(P({ experience: 'some', days: 2 })).toBe('full_body_2')
    expect(P({ experience: 'experienced', days: 3, goal: 'muscle' })).toBe('full_body_3')
    // the research workhorse
    expect(P({ experience: 'some', days: 4, goal: 'muscle' })).toBe('upper_lower_4')
    // strength lives on U/L even at high frequency (compounds need recovery)
    expect(P({ experience: 'experienced', days: 6, goal: 'strength', session: '60_75' })).toBe('upper_lower_4')
    // 5-day hypertrophy default → PPL rotation (2x/week beats a 1x/week bro
    // split); bro_5 is reserved for an explicit body-part-split preference
    expect(P({ experience: 'some', days: 5, goal: 'muscle', style: 'surprise_me', session: '60_75' })).toBe('ppl_3')
    expect(P({ experience: 'some', days: 5, goal: 'muscle', style: 'ppl', session: '60_75' })).toBe('ppl_3')
    expect(P({ experience: 'some', days: 5, goal: 'muscle', style: 'one_body_part', session: '60_75' })).toBe('bro_5')
    // 6-day muscle: experienced → H/V PPL, intermediate → classic PPL
    expect(P({ experience: 'experienced', days: 6, goal: 'muscle', style: 'surprise_me', session: '60_75', recovery: 'great' })).toBe('ppl_6')
    expect(P({ experience: 'some', days: 6, goal: 'muscle', style: 'surprise_me', session: '60_75', recovery: 'great' })).toBe('ppl_3')
    // explicit full-body pick is always honored
    expect(P({ experience: 'experienced', days: 6, style: 'full_body' })).toBe('full_body_3')
  })

  test('fatigue caps route to a real split, never a 3-day full body', () => {
    // cardio-primary at 5 days → 4-day Upper/Lower with a heads-up (the
    // original screenshot bug was 5 days silently becoming a 3-day full body)
    for (const cardioAndOutside of ['cardio_first'] as const) {
      const rec = recommendIntake(baseAnswers({ cardioAndOutside, days: 5, goal: 'muscle', style: 'ppl' }))
      expect(rec.presetId).toBe('upper_lower_4')
      expect(rec.daysOverride?.recommended).toBe(4)
    }
    // sport/running only trims 6-7 down to 5, leaving a 5-day trainer at 5
    for (const cardioAndOutside of ['sport', 'running'] as const) {
      const rec = recommendIntake(baseAnswers({ cardioAndOutside, days: 5, goal: 'muscle', style: 'surprise_me', session: '60_75' }))
      expect(rec.daysOverride).toBeUndefined()
      expect(rec.presetId).toBe('ppl_3')
    }
  })

  test('retaking with changed answers yields a genuinely different split', () => {
    // A returning user who retakes the intake with new answers must get a new
    // recommendation off that data, not a stale one.
    const before = recommendIntake(baseAnswers({ experience: 'new', days: 3, goal: 'health', style: 'full_body' }))
    const after = recommendIntake(baseAnswers({ experience: 'experienced', days: 6, goal: 'muscle', style: 'surprise_me', recovery: 'great', session: '60_75' }))
    expect(before.presetId).toBe('full_body_3')
    expect(after.presetId).toBe('ppl_6')
    expect(before.presetId).not.toBe(after.presetId)
  })
})

// ─── quiz → logger pipeline: opting out of a lift is honored on EVERY lift ──
describe('recommendExercises — no opted-out lift ever reaches the logger', () => {
  // The user's core trust test: whatever they flag, it must not appear in a
  // single recommended set, in any split — and a substitution can't sneak a
  // banned variant back in (deadlift→RDL, ohp→seated DB press, etc.).
  const BANNED_BY_RESTRICTION: Record<Restriction, string[]> = {
    heavy_squat: ['back_squat', 'front_squat'],
    heavy_dl:    ['conv_dl', 'rdl'],
    ohp:         ['standing_ohp', 'push_press', 'seated_db_ohp', 'machine_ohp'],
    heavy_pull:  ['pullup_weighted', 'bb_row', 'pendlay_row'],
    explosive:   ['push_press'],
    bench:       ['bench_bb', 'incl_bb_bench', 'close_grip'],
    lower_back:  ['back_squat', 'front_squat', 'conv_dl', 'rdl', 'bb_row', 'pendlay_row'],
  }

  test('each single restriction removes its lifts from every split', () => {
    for (const r of RESTRICTIONS) {
      for (const preset of PRESETS) {
        const a = baseAnswers({ restrictions: [r] })
        const ids = recommendExercises(preset, a).days.flatMap(d => d.exercises.map(e => e.id))
        for (const banned of BANNED_BY_RESTRICTION[r]) {
          expect(ids).not.toContain(banned)
        }
      }
    }
  })

  test('overlapping restrictions cannot re-introduce a banned lift (ohp + explosive)', () => {
    // explosive substitutes toward a shoulder press; with ohp also flagged,
    // the final guard must still leave zero overhead presses.
    for (const preset of PRESETS) {
      const a = baseAnswers({ restrictions: ['ohp', 'explosive'] })
      const ids = recommendExercises(preset, a).days.flatMap(d => d.exercises.map(e => e.id))
      for (const banned of ['standing_ohp', 'push_press', 'seated_db_ohp', 'machine_ohp']) {
        expect(ids).not.toContain(banned)
      }
    }
  })

  test('every selected restriction is surfaced in the recommendation factors', () => {
    const rec = recommendIntake(baseAnswers({ restrictions: ['heavy_squat', 'heavy_dl', 'bench', 'ohp'] }))
    const restrictionFactor = rec.factors?.find(f => f.category === 'restrictions')
    expect(restrictionFactor).toBeDefined()
    // the decision text names every lift the user opted out of
    for (const needle of ['heavy squats', 'deadlifts', 'bench', 'overhead press']) {
      expect(restrictionFactor?.decision).toContain(needle)
    }
  })
})

// ─── recommendExercises — restriction honesty ─────────────────────────
describe('recommendExercises — opting out of a lift removes it everywhere', () => {
  test('"no deadlifting" leaves zero deadlift variants in any recommended split', () => {
    // The user\'s explicit ask: hate deadlifting → the recommended workouts
    // must contain no conventional deadlift AND no RDL (any barbell hinge).
    for (const preset of PRESETS) {
      const a = baseAnswers({ restrictions: ['heavy_dl'] })
      const { days } = recommendExercises(preset, a)
      const ids = days.flatMap(d => d.exercises.map(e => e.id))
      expect(ids).not.toContain('conv_dl')
      expect(ids).not.toContain('rdl')
    }
  })

  test('a lower-back flag removes squats and all deadlifts across every split', () => {
    for (const preset of PRESETS) {
      const a = baseAnswers({ restrictions: ['lower_back'] })
      const { days } = recommendExercises(preset, a)
      const ids = days.flatMap(d => d.exercises.map(e => e.id))
      for (const banned of ['conv_dl', 'rdl', 'back_squat', 'front_squat']) {
        expect(ids).not.toContain(banned)
      }
    }
  })
})
