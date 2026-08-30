import { resolveBlockLink, type BrandLite } from '@/app/app/peak/scheduleLinks'

const BRANDS: BrandLite[] = [
  { id: 'b_rowan', name: 'sam', color: '#6EE7B7' },
  { id: 'b_etsy', name: 'Etsy Shop', color: '#FB923C' },
]

describe('resolveBlockLink — schedule block → module deep-link', () => {
  test('exact brand-name title links to that brand page', () => {
    const link = resolveBlockLink('sam', BRANDS)
    expect(link).toEqual({ kind: 'brand', href: '/app/brand/b_rowan', label: 'sam', color: '#6EE7B7' })
  })

  test('brand name as a whole word inside the title still matches', () => {
    const link = resolveBlockLink('ship sam', BRANDS)
    expect(link?.kind).toBe('brand')
    expect(link?.href).toBe('/app/brand/b_rowan')
  })

  test('multi-word brand names match', () => {
    expect(resolveBlockLink('Etsy Shop', BRANDS)?.href).toBe('/app/brand/b_etsy')
  })

  test('workout-flavoured titles link to the training logger', () => {
    expect(resolveBlockLink('gym', BRANDS)).toMatchObject({ kind: 'workout', href: '/app/fitness/log' })
    expect(resolveBlockLink('leg day workout', BRANDS)?.kind).toBe('workout')
  })

  test('brands win over workout keywords', () => {
    const link = resolveBlockLink('sam', [{ id: 'b_x', name: 'sam', color: '#fff' }])
    expect(link?.kind).toBe('brand')
  })

  test('an unrelated title links to nothing', () => {
    expect(resolveBlockLink('dentist appointment', BRANDS)).toBeNull()
  })

  test('partial-word brand names do NOT false-match', () => {
    // "sam" must not match inside "rowanville"
    expect(resolveBlockLink('rowanville cleanup', BRANDS)).toBeNull()
  })
})
