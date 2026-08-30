/**
 * @jest-environment jsdom
 *
 * Task 7b: the Studio tile's bespoke dashboard poster (HomeTileFace's isStudio
 * branch in app/app/DashboardGrid.tsx). Two things must both be true:
 *   1. A user tile whose chosen design is 'studio-spark' gets the bespoke
 *      poster chrome (mono kicker, "connected"-style badge, ghost-mint open
 *      glyph, live hero number when reported data exists).
 *   2. NOTHING else changes: a non-Studio user tile (and a core tile) render
 *      exactly their old chrome (no is-studio class, no studioFace markup),
 *      proving the gate is additive and isolated.
 */
import { render, screen, waitFor } from '@testing-library/react'
import type { Skin } from '@/lib/tiles/tileSkin'
import type { Tile } from '@/lib/tiles/types'
import { CORE_TILES } from '@/lib/tiles/coreTiles'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

// The design-art entrance/idle motion mounts real DOM animation timing that jsdom
// can't satisfy (same reasoning dashboard.test.tsx uses for DashboardCrystals);
// stub it so DesignArt just renders the SVG without animating it.
jest.mock('@/components/widgetMotion', () => ({
  __esModule: true,
  animate: jest.fn(),
  MOTION: {},
}))

// Controllable fake of the two tables useStudioCount reads (tile_streams ->
// tile_reports), keyed by table name. Defaults to "never reported" (both null),
// which is exactly the "omit the number" path.
const fakeStream: { data: { id: string } | null } = { data: null }
const fakeReport: { data: { value: number } | null } = { data: null }

function chain(resolved: unknown) {
  const builder: Record<string, jest.Mock> = {}
  const self = () => builder as unknown as PromiseLike<unknown>
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.order = jest.fn(() => builder)
  builder.limit = jest.fn(() => builder)
  builder.maybeSingle = jest.fn(async () => resolved)
  return builder
}

jest.mock('@/lib/supabase/client', () => ({
  __esModule: true,
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'tile_streams') return chain({ data: fakeStream.data, error: null })
      if (table === 'tile_reports') return chain({ data: fakeReport.data, error: null })
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HomeTileFace } = require('@/app/app/DashboardGrid')

const noop = () => {}
const baseSkin = (overrides: Partial<Skin> = {}): Skin => ({
  size: 's',
  design: null,
  color: null,
  name: null,
  livingDots: true,
  ...overrides,
})

const studioTile: Tile = {
  id: 'studio-tile-1',
  name: 'Studio',
  html: '<html></html>',
  createdAt: 0,
  updatedAt: 0,
}

describe('Studio dashboard poster (isolated gate)', () => {
  beforeEach(() => {
    fakeStream.data = null
    fakeReport.data = null
  })

  it('renders the bespoke Studio chrome when the tile design is studio-spark', async () => {
    render(
      <HomeTileFace
        id="studio-tile-1"
        skin={baseSkin({ design: 'studio-spark' })}
        editing={false}
        onResize={noop}
        onEdit={noop}
        onRemove={noop}
        kind="user"
        tile={studioTile}
        onOpen={noop}
      />,
    )
    expect(screen.getByText('STUDIO')).toBeInTheDocument()
    expect(screen.getByText('TRACKING')).toBeInTheDocument()
    expect(document.querySelector('.tile.is-studio')).not.toBeNull()
    expect(document.querySelector('.studioFace')).not.toBeNull()
    // Never-reported tile: the hero number is omitted, not faked as zero.
    expect(document.querySelector('.spHero')).toBeNull()
  })

  it('wires the hero number live from tile_streams/tile_reports when data exists', async () => {
    fakeStream.data = { id: 'stream-1' }
    fakeReport.data = { value: 6 }
    render(
      <HomeTileFace
        id="studio-tile-1"
        skin={baseSkin({ design: 'studio-spark' })}
        editing={false}
        onResize={noop}
        onEdit={noop}
        onRemove={noop}
        kind="user"
        tile={studioTile}
        onOpen={noop}
      />,
    )
    await waitFor(() => expect(document.querySelector('.spHero b')).not.toBeNull())
    expect(document.querySelector('.spHero b')?.textContent).toBe('6')
  })

  it('does NOT gate a non-Studio user tile into the Studio poster', () => {
    const plainTile: Tile = { ...studioTile, id: 'plain-tile-1', name: 'My Habit' }
    render(
      <HomeTileFace
        id="plain-tile-1"
        skin={baseSkin({ design: 'sparkline-end-dot' })}
        editing={false}
        onResize={noop}
        onEdit={noop}
        onRemove={noop}
        kind="user"
        tile={plainTile}
        onOpen={noop}
      />,
    )
    expect(document.querySelector('.tile.is-studio')).toBeNull()
    expect(document.querySelector('.studioFace')).toBeNull()
    expect(screen.queryByText('STUDIO')).toBeNull()
    // The generic chrome it relied on before is untouched.
    expect(screen.getByText('My Habit')).toBeInTheDocument()
  })

  it('does NOT gate a core tile into the Studio poster', () => {
    render(
      <HomeTileFace
        id="train"
        skin={baseSkin()}
        editing={false}
        onResize={noop}
        onEdit={noop}
        onRemove={noop}
        kind="core"
        core={CORE_TILES.train}
        stat={null}
      />,
    )
    expect(document.querySelector('.tile.is-studio')).toBeNull()
    expect(document.querySelector('.studioFace')).toBeNull()
    expect(screen.getByText(CORE_TILES.train.label)).toBeInTheDocument()
  })
})
