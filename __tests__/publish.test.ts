import { tilePublishPayload, publishedRowToEnvelope, MAX_PUBLISH_HTML } from '@/lib/tiles/publish'
import { tileToEnvelope } from '@/lib/tiles/share'
import type { Tile } from '@/lib/tiles/types'
import type { Skin } from '@/lib/tiles/tileSkin'

const tile: Tile = {
  id: 't1',
  name: 'My to-dos',
  html: '<!doctype html><body>héllo · 世界 </script> ok</body>',
  createdAt: 1,
  updatedAt: 1,
  category: 'Done',
}
const skin: Skin = { size: 'm', design: 'tide-layers', color: '#6EE7B7', name: 'Custom name', livingDots: true }

describe('tile publish payload (Arts District v3)', () => {
  test('builds an insert row from a tile + skin, crediting the creator', () => {
    const r = tilePublishPayload(tile, skin, 'user-123')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row.creator_id).toBe('user-123')
    expect(r.row.name).toBe('Custom name') // skin name wins, same as share
    expect(r.row.html).toBe(tile.html)
    expect(r.row.category).toBe('Done')
    expect(r.row.opt_in_reuse).toBe(true) // default on
    expect(r.row.status).toBe('pending') // never self-approved
  })

  test('the stored envelope is byte-identical to the v1 share envelope (no divergence)', () => {
    const r = tilePublishPayload(tile, skin, 'user-123')
    if (!r.ok) return
    expect(r.row.envelope).toEqual(tileToEnvelope(tile, skin))
  })

  test('opt_in_reuse can be turned off', () => {
    const r = tilePublishPayload(tile, skin, 'user-123', { optInReuse: false })
    if (!r.ok) return
    expect(r.row.opt_in_reuse).toBe(false)
  })

  test('rejects an empty creatorId', () => {
    const r = tilePublishPayload(tile, skin, '')
    expect(r.ok).toBe(false)
  })

  test('rejects empty html', () => {
    const r = tilePublishPayload({ ...tile, html: '   ' }, { ...skin, name: '' }, 'user-123')
    expect(r.ok).toBe(false)
  })

  test('rejects empty name (no skin name, no tile name)', () => {
    const r = tilePublishPayload({ ...tile, name: '' }, { ...skin, name: '' }, 'user-123')
    expect(r.ok).toBe(false)
  })

  test('rejects html over the 1MB import cap (an unpublishable tile)', () => {
    const big = { ...tile, html: 'x'.repeat(MAX_PUBLISH_HTML + 1) }
    const r = tilePublishPayload(big, skin, 'user-123')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/large|big|cap|limit/i)
  })

  test('a published row round-trips back to an importable envelope', () => {
    const r = tilePublishPayload(tile, skin, 'user-123')
    if (!r.ok) return
    const env = publishedRowToEnvelope({ envelope: r.row.envelope, name: r.row.name, html: r.row.html })
    expect(env).toBeTruthy()
    expect(env!.html).toBe(tile.html)
    expect(env!.name).toBe('Custom name')
  })

  test('publishedRowToEnvelope falls back to name/html if envelope jsonb is junk', () => {
    const env = publishedRowToEnvelope({ envelope: null, name: 'Fallback', html: '<p>x</p>' })
    expect(env).toBeTruthy()
    expect(env!.name).toBe('Fallback')
    expect(env!.html).toBe('<p>x</p>')
  })
})
