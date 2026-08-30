import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(join(process.cwd(), 'public/studio-tile.html'), 'utf8')
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u

describe('the sealed Studio tile', () => {
  test('ships the Vitality bridge shim, used all three ways', () => {
    expect(html).toContain("source:'vitality-tile'")
    expect(html).toMatch(/Vitality\.load\s*\(/)
    expect(html).toMatch(/Vitality\.save\s*\(/)
    expect(html).toMatch(/Vitality\.report\s*\(/)
    // it reacts to the host's load:result reply
    expect(html).toMatch(/m\.type\s*===\s*'load:result'/)
  })

  test('speaks the gated studio verbs through the host, never directly', () => {
    expect(html).toContain("'studio:lookup'")
    expect(html).toContain("'studio:status'")
    expect(html).toContain("'studio:connect'")
    expect(html).toContain("'studio:channel'")
    expect(html).toContain("'studio:claude'")
    expect(html).toMatch(/rpc\('ai'/)
    // and shows honest copy when the host refuses them
    expect(html).toContain('forbidden')
  })

  test('is script-first with a channel-aware, anti-repeat master prompt', () => {
    // the primary input is the script, not the link
    expect(html).toMatch(/drop the \.txt, or choose a file/i)
    // the master prompt carries the strict paste-back format both ways
    expect(html).toContain('END DESCRIPTION')
    expect(html).toContain('END CHAPTERS')
    // channel voice + don't-repeat context
    expect(html).toMatch(/never repeat or closely echo/i)
    // deterministic anti-clash check exists client-side
    expect(html).toMatch(/clashWith/)
    // set-in-stone links are appended deterministically
    expect(html).toMatch(/ensureLinksBlock/)
  })

  test('reports exactly the videos_published stream', () => {
    expect(html).toContain("key:'videos_published'")
    expect(html).toContain("kind:'count'")
    expect(html).toContain("goalDirection:'up'")
  })

  test('is sealed: never touches its own web storage', () => {
    expect(html).not.toMatch(/localStorage|sessionStorage/)
  })

  test('makes no external network request (no key, no third party)', () => {
    expect(html).not.toMatch(/fetch\s*\(|XMLHttpRequest|import\s+.*from|<script[^>]+src=/)
    // no CDN stylesheets or font links either; fonts ride inline
    expect(html).not.toMatch(/<link[^>]+href=/)
    expect(html).toContain('data:font/woff2;base64,')
  })

  test('brand law: no emoji, no em or en dashes', () => {
    expect(html).not.toMatch(EMOJI)
    expect(html).not.toMatch(/[—–]/)
  })

  test('has the four surfaces: New, Videos, Links, Stats', () => {
    expect(html).toMatch(/data-tab="new"/)
    expect(html).toMatch(/data-tab="videos"/)
    expect(html).toMatch(/data-tab="links"/)
    expect(html).toMatch(/data-tab="stats"/)
    expect(html).toMatch(/New video/i)
    expect(html).toMatch(/Add a link/i)
    expect(html).toMatch(/Connect YouTube/i)
  })

  test('fits under the 1MB importTile HTML cap', () => {
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(1024 * 1024)
  })
})
