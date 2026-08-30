import { shouldDistill, DISTILL_THRESHOLD } from '@/lib/coach/memory'

test('distills only after the threshold of new messages', () => {
  expect(shouldDistill(0, 0)).toBe(false)
  expect(shouldDistill(DISTILL_THRESHOLD - 1, 0)).toBe(false)
  expect(shouldDistill(DISTILL_THRESHOLD, 0)).toBe(true)
  expect(shouldDistill(20, 14)).toBe(false) // only 6 new
  expect(shouldDistill(22, 14)).toBe(true)  // 8 new
})
