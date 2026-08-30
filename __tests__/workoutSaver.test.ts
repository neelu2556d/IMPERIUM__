import { createWorkoutSaver } from '@/lib/workouts/saver'

/** A promise we can resolve from the outside, to hold a save "in-flight". */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Flush the microtask queue a few times so awaited saves settle. */
async function tick() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('schedule() debounces and saves once after the debounce window', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const saver = createWorkoutSaver({ debounceMs: 600, save: async (o) => { calls.push(o) } })

  saver.schedule()
  jest.advanceTimersByTime(599)
  expect(calls).toHaveLength(0)

  jest.advanceTimersByTime(1)
  await tick()
  expect(calls).toHaveLength(1)
  expect(calls[0].keepalive).toBe(false)
})

test('flushNow() saves immediately without waiting for the debounce', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const saver = createWorkoutSaver({ debounceMs: 600, save: async (o) => { calls.push(o) } })

  saver.flushNow()
  await tick()
  expect(calls).toHaveLength(1)
  expect(calls[0].keepalive).toBe(false)
})

test('edits made while a save is in-flight are persisted, not dropped', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const gate = deferred<void>()
  const saver = createWorkoutSaver({
    debounceMs: 600,
    save: async (o) => {
      calls.push(o)
      if (calls.length === 1) await gate.promise // hold the first save in-flight
    },
  })

  saver.flushNow()           // save #1 starts, blocks on the gate
  await tick()
  expect(calls).toHaveLength(1)

  saver.schedule()           // a new edit arrives mid-flight
  jest.advanceTimersByTime(600)
  await tick()
  expect(calls).toHaveLength(1) // must NOT double-fire while #1 is in-flight

  gate.resolve()             // #1 completes
  await tick()
  expect(calls).toHaveLength(2) // the dirty edit re-armed and saved
})

test('flushUnload() writes with keepalive even while a save is in-flight', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const gate = deferred<void>()
  const saver = createWorkoutSaver({
    debounceMs: 600,
    save: async (o) => {
      calls.push(o)
      if (calls.length === 1) await gate.promise
    },
  })

  saver.flushNow()           // save #1 in-flight (page still open)
  await tick()
  expect(calls).toHaveLength(1)

  saver.flushUnload()        // page hiding mid-save: must NOT bail
  await tick()
  expect(calls).toHaveLength(2)
  expect(calls[1].keepalive).toBe(true)

  gate.resolve()
})

test('dispose() flushes a pending debounced edit so navigate-away persists', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const saver = createWorkoutSaver({ debounceMs: 600, save: async (o) => { calls.push(o) } })

  saver.schedule()           // dirty, debounce timer pending
  saver.dispose()            // component unmounts before the timer fires
  await tick()
  expect(calls).toHaveLength(1)
  expect(calls[0].keepalive).toBe(true)
})

test('dispose() does not write when there are no unsaved edits', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const saver = createWorkoutSaver({ debounceMs: 600, save: async (o) => { calls.push(o) } })

  saver.flushNow()
  await tick()
  expect(calls).toHaveLength(1)

  saver.dispose()            // nothing dirty since the last successful save
  await tick()
  expect(calls).toHaveLength(1) // no spurious write
})

test('disable() makes the saver inert — no write fires on any later trigger', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const saver = createWorkoutSaver({ debounceMs: 600, save: async (o) => { calls.push(o) } })

  // After finishSession persists the workout, the saver must go SILENT. No
  // debounced edit, no immediate flush, and crucially no unload/unmount write
  // may fire a contentless save that could delete the just-finished row.
  saver.disable()

  saver.schedule()
  jest.advanceTimersByTime(600)
  await tick()

  saver.flushNow()
  await tick()

  saver.flushUnload()
  await tick()

  saver.dispose()
  await tick()

  expect(calls).toHaveLength(0)
})

test('flushUnload() does not write after disable() — the exact post-finish pagehide path', async () => {
  const calls: Array<{ keepalive: boolean }> = []
  const saver = createWorkoutSaver({ debounceMs: 600, save: async (o) => { calls.push(o) } })

  saver.schedule()    // an edit was pending right before the user finished
  saver.disable()     // session finished → saver goes silent
  saver.flushUnload() // user backgrounds the app during the celebration
  await tick()

  expect(calls).toHaveLength(0)
})
