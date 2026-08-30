import { envelopeToWrites, writesToEnvelope, type StudioEnvelope } from '@/lib/studio/sync'
import type { StudioVideo, StudioLink } from '@/lib/studio/types'

describe('studio envelope <-> endpoint payloads', () => {
  test('envelopeToWrites splits the saved blob into video + link rows', () => {
    const env: StudioEnvelope = {
      v: 1,
      videos: [{ id: 'v1', title: 'EP3', url: '', status: 'published', publishedAt: '2026-07-03', notes: null, extra: { tags: ['a'] } }],
      links: [{ id: 'l1', videoId: null, label: 'X', url: 'x.com', kind: 'social', isDefault: true, position: 0 }],
    }
    const w = envelopeToWrites(env)
    expect(w.videos[0].title).toBe('EP3')
    expect(w.links[0].label).toBe('X')
  })

  test('writesToEnvelope round-trips the API shapes back into the saved blob', () => {
    const videos: StudioVideo[] = [
      { id: 'v1', title: 'EP3', url: '', status: 'draft', publishedAt: null, notes: null, extra: null, createdAt: '', updatedAt: '' },
    ]
    const links: StudioLink[] = [
      { id: 'l1', videoId: null, label: 'X', url: 'x.com', kind: 'other', isDefault: false, position: 0 },
    ]
    const env = writesToEnvelope(videos, links)
    expect(env.v).toBe(1)
    expect(env.videos).toHaveLength(1)
    expect(env.links).toHaveLength(1)
  })
})
