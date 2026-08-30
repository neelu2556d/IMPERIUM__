/**
 * @jest-environment jsdom
 */

// Tests the host-side message listener directly (real onMessage logic, real
// register/unregister), so a regression that widens the 'ai' trust gate, or
// that changes save/load/report behavior while adding 'ai', is caught here.
// tileStore is mocked (its own persistence is covered elsewhere); fetch is
// mocked to stand in for the real /api/studio/package call.

import { renderHook, act } from '@testing-library/react'
import { useTileHost } from '@/lib/tiles/useTileHost'

const mockSaveData = jest.fn((..._args: unknown[]) => true)
const mockLoadData = jest.fn((..._args: unknown[]) => ['loaded-item'])

jest.mock('@/lib/tiles/tileStore', () => ({
  tileStore: {
    saveData: (...args: unknown[]) => mockSaveData(...args),
    loadData: (...args: unknown[]) => mockLoadData(...args),
  },
}))

/** A minimal stand-in for an iframe's contentWindow: identity-stable (usable
 *  as a WeakMap/WeakSet key) and postMessage-able (the host replies on it). */
function fakeWindow(): Window {
  return { postMessage: jest.fn() } as unknown as Window
}

/** Dispatches a tile->host message as if it came from `source`. */
function dispatch(data: unknown, source: Window) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source: source as unknown as MessageEventSource }))
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  mockSaveData.mockClear().mockReturnValue(true)
  mockLoadData.mockClear().mockReturnValue(['loaded-item'])
  global.fetch = jest.fn()
})

describe('useTileHost: ai verb gating', () => {
  test('ai from an untrusted window returns ai:error forbidden and never calls fetch', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-1') }) // no { trusted: true }

    dispatch({ source: 'vitality-tile', type: 'ai', id: 'req-1', input: 'hello', kind: 'notes' }, win)

    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'ai:error', id: 'req-1', reason: 'forbidden' },
      '*',
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('ai from a trusted window calls /api/studio/package with credentials same-origin and forwards ai:result', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ titles: ['A title'] }),
    })
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    dispatch({ source: 'vitality-tile', type: 'ai', id: 'req-2', input: 'hello', kind: 'notes' }, win)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/studio/package')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')

    await flush()

    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'ai:result', id: 'req-2', data: { titles: ['A title'] } },
      '*',
    )
  })

  test('a trusted-window ai:error reply is sent when the fetch resolves not-ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'daily_limit_reached' }),
    })
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    dispatch({ source: 'vitality-tile', type: 'ai', id: 'req-3', input: 'hello' }, win)
    await flush()

    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'ai:error', id: 'req-3', reason: 'daily_limit_reached' },
      '*',
    )
  })

  test('only input and kind are forwarded onto the fetch body; other spread fields are ignored', () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    dispatch({
      source: 'vitality-tile',
      type: 'ai',
      id: 'req-4',
      input: 'the real input',
      kind: 'idea',
      // spoofed/injected extra fields a hostile or buggy tile might add
      userId: 'someone-elses-id',
      apiKey: 'steal-me',
      admin: true,
    }, win)

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ input: 'the real input', kind: 'idea' })
  })

  test('userId change clears trust: a previously trusted window becomes forbidden', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ titles: [] }) })
    const { result, rerender } = renderHook(({ userId }) => useTileHost(userId), {
      initialProps: { userId: 'user-1' },
    })
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    // still trusted under the same user
    dispatch({ source: 'vitality-tile', type: 'ai', id: 'req-5', input: 'x' }, win)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    await flush()

    // switch users: the hook resets both the registry and the trust set
    rerender({ userId: 'user-2' })
    ;(global.fetch as jest.Mock).mockClear()
    ;(win.postMessage as jest.Mock).mockClear()

    // simulate the real flow: the surrounding component re-registers the same
    // window for the new user (e.g. on a re-render), this time WITHOUT the
    // trusted opt, exactly like DashboardGrid.tsx would if it re-evaluated
    // "is this the first-party Studio install" for the new user's tiles.
    act(() => { result.current.register(win, 'tile-studio') })

    dispatch({ source: 'vitality-tile', type: 'ai', id: 'req-6', input: 'x' }, win)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'ai:error', id: 'req-6', reason: 'forbidden' },
      '*',
    )
  })
})

describe('useTileHost: save/load/report are unchanged for trusted and untrusted windows', () => {
  test('save works the same whether or not the window is trusted', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const untrusted = fakeWindow()
    const trusted = fakeWindow()
    act(() => {
      result.current.register(untrusted, 'tile-a')
      result.current.register(trusted, 'tile-b', { trusted: true })
    })

    dispatch({ source: 'vitality-tile', type: 'save', id: 's1', data: [1, 2, 3] }, untrusted)
    dispatch({ source: 'vitality-tile', type: 'save', id: 's2', data: [1, 2] }, trusted)

    expect(mockSaveData).toHaveBeenNthCalledWith(1, 'user-1', 'tile-a', [1, 2, 3])
    expect(mockSaveData).toHaveBeenNthCalledWith(2, 'user-1', 'tile-b', [1, 2])
    // save never posts back on success, trust status doesn't change that
    expect(untrusted.postMessage).not.toHaveBeenCalled()
    expect(trusted.postMessage).not.toHaveBeenCalled()
  })

  test('load replies with load:result the same whether or not the window is trusted', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const untrusted = fakeWindow()
    const trusted = fakeWindow()
    act(() => {
      result.current.register(untrusted, 'tile-a')
      result.current.register(trusted, 'tile-b', { trusted: true })
    })

    dispatch({ source: 'vitality-tile', type: 'load', id: 'l1' }, untrusted)
    dispatch({ source: 'vitality-tile', type: 'load', id: 'l2' }, trusted)

    expect(untrusted.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'load:result', id: 'l1', data: ['loaded-item'] }, '*',
    )
    expect(trusted.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'load:result', id: 'l2', data: ['loaded-item'] }, '*',
    )
  })

  test('report forwards to the injected handler the same whether or not the window is trusted', () => {
    const onReport = jest.fn()
    const { result } = renderHook(() => useTileHost('user-1', undefined, onReport))
    const untrusted = fakeWindow()
    const trusted = fakeWindow()
    act(() => {
      result.current.register(untrusted, 'tile-a')
      result.current.register(trusted, 'tile-b', { trusted: true })
    })

    dispatch({ source: 'vitality-tile', type: 'report', id: 'r1', stream: { key: 'beer', value: 1 } }, untrusted)
    dispatch({ source: 'vitality-tile', type: 'report', id: 'r2', stream: { key: 'reading', value: 2 } }, trusted)

    expect(onReport).toHaveBeenNthCalledWith(1, { key: 'beer', value: 1 }, 'tile-a')
    expect(onReport).toHaveBeenNthCalledWith(2, { key: 'reading', value: 2 }, 'tile-b')
  })

  test('unregister drops both the registry and the trust bit for a window', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })
    act(() => { result.current.unregister(win) })

    // no longer a registered sender at all, so even 'load' (untrusted-safe) is ignored
    dispatch({ source: 'vitality-tile', type: 'load', id: 'l1' }, win)
    expect(win.postMessage).not.toHaveBeenCalled()
  })
})

describe('useTileHost: studio verbs share the ai trust gate', () => {
  test('studio:lookup from an untrusted window is refused with no fetch', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-1') })

    dispatch({ source: 'vitality-tile', type: 'studio:lookup', id: 'lk-1', url: 'https://youtu.be/abcdefghijk' }, win)

    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:lookup:error', id: 'lk-1', reason: 'forbidden' },
      '*',
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('studio:lookup from a trusted window POSTs only the url and forwards the result', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ video: { videoId: 'abcdefghijk', title: 'A video' } }),
    })
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    dispatch({
      source: 'vitality-tile', type: 'studio:lookup', id: 'lk-2',
      url: 'https://youtu.be/abcdefghijk', sneaky: 'field',
    }, win)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/studio/lookup')
    expect(init.credentials).toBe('same-origin')
    // strict whitelist: only the url rides along, never the whole message
    expect(JSON.parse(init.body)).toEqual({ url: 'https://youtu.be/abcdefghijk' })

    await flush()
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:lookup:result', id: 'lk-2', data: { video: { videoId: 'abcdefghijk', title: 'A video' } } },
      '*',
    )
  })

  test('studio:status from a trusted window returns only the youtube connector, minimally shaped', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        connectors: [
          { id: 'stripe', connected: true, secretStuff: 'x' },
          { id: 'youtube', configured: true, connected: true, accountLabel: 'example', metrics: { subscribers: 12 }, lastError: 'private' },
        ],
      }),
    })
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    dispatch({ source: 'vitality-tile', type: 'studio:status', id: 'st-1' }, win)
    await flush()

    expect(win.postMessage).toHaveBeenCalledWith(
      {
        source: 'vitality-host', type: 'studio:status:result', id: 'st-1',
        data: { configured: true, connected: true, accountLabel: 'example', metrics: { subscribers: 12 } },
      },
      '*',
    )
  })

  test('studio:status untrusted is refused with no fetch', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-1') })
    dispatch({ source: 'vitality-tile', type: 'studio:status', id: 'st-2' }, win)
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:status:error', id: 'st-2', reason: 'forbidden' },
      '*',
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('studio:connect trusted opens the youtube connect route in a new tab; untrusted does not', () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue({} as Window)
    const { result } = renderHook(() => useTileHost('user-1'))

    const evil = fakeWindow()
    act(() => { result.current.register(evil, 'tile-evil') })
    dispatch({ source: 'vitality-tile', type: 'studio:connect', id: 'cn-0' }, evil)
    expect(openSpy).not.toHaveBeenCalled()
    expect(evil.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:connect:error', id: 'cn-0', reason: 'forbidden' },
      '*',
    )

    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })
    dispatch({ source: 'vitality-tile', type: 'studio:connect', id: 'cn-1' }, win)
    expect(openSpy).toHaveBeenCalledWith('/api/connectors/youtube/connect', '_blank')
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:connect:result', id: 'cn-1', opened: true },
      '*',
    )
    openSpy.mockRestore()
  })

  test('studio:channel from an untrusted window is refused with no fetch', () => {
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-1') })

    dispatch({ source: 'vitality-tile', type: 'studio:channel', id: 'ch-0', channel: '@example' }, win)

    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:channel:error', id: 'ch-0', reason: 'forbidden' },
      '*',
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('studio:channel from a trusted window POSTs only the channel string and forwards the result', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ channel: { id: 'UCx', handle: '@example', title: 'example', videos: [] } }),
    })
    const { result } = renderHook(() => useTileHost('user-1'))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })

    dispatch({
      source: 'vitality-tile', type: 'studio:channel', id: 'ch-1',
      channel: '@example', sneaky: 'field',
    }, win)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/studio/channel')
    expect(init.credentials).toBe('same-origin')
    // strict whitelist: only the channel string rides along
    expect(JSON.parse(init.body)).toEqual({ channel: '@example' })

    await flush()
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:channel:result', id: 'ch-1', data: { channel: { id: 'UCx', handle: '@example', title: 'example', videos: [] } } },
      '*',
    )
  })

  test('studio:claude trusted opens claude.ai/new with noopener; untrusted does not open anything', () => {
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null)
    const { result } = renderHook(() => useTileHost('user-1'))

    const evil = fakeWindow()
    act(() => { result.current.register(evil, 'tile-evil') })
    dispatch({ source: 'vitality-tile', type: 'studio:claude', id: 'cl-0' }, evil)
    expect(openSpy).not.toHaveBeenCalled()
    expect(evil.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:claude:error', id: 'cl-0', reason: 'forbidden' },
      '*',
    )

    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-studio', { trusted: true }) })
    dispatch({ source: 'vitality-tile', type: 'studio:claude', id: 'cl-1' }, win)
    expect(openSpy).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener')
    // noopener means a null return even on success, so the host reports
    // opened:true unconditionally rather than lying about a block
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'studio:claude:result', id: 'cl-1', opened: true },
      '*',
    )
    openSpy.mockRestore()
  })
})

describe('useTileHost: report is acknowledged honestly (the silent-swallow fix)', () => {
  test('a successful write fires the report activity exactly once', async () => {
    const onActivity = jest.fn()
    const onReport = jest.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useTileHost('user-1', onActivity, onReport))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-a') })

    dispatch({ source: 'vitality-tile', type: 'report', id: 'r1', stream: { key: 'water', value: 1 } }, win)
    await flush()

    expect(onReport).toHaveBeenCalledWith({ key: 'water', value: 1 }, 'tile-a')
    expect(onActivity).toHaveBeenCalledWith({ tileId: 'tile-a', type: 'report', count: 1 })
    expect(win.postMessage).not.toHaveBeenCalled() // success is quiet, like save
  })

  test('a failed write posts report:error to the tile and NEVER fires the activity', async () => {
    const onActivity = jest.fn()
    const onReport = jest.fn().mockResolvedValue({ ok: false, error: 'unauthorized' })
    const { result } = renderHook(() => useTileHost('user-1', onActivity, onReport))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-a') })

    dispatch({ source: 'vitality-tile', type: 'report', id: 'r9', stream: { key: 'water', value: 1 } }, win)
    await flush()

    expect(onActivity).not.toHaveBeenCalled()
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'report:error', id: 'r9', reason: 'unauthorized' }, '*',
    )
  })

  test('a transport-level rejection also posts report:error (no unhandled rejection)', async () => {
    const onActivity = jest.fn()
    const onReport = jest.fn().mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useTileHost('user-1', onActivity, onReport))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-a') })

    dispatch({ source: 'vitality-tile', type: 'report', id: 'r2', stream: { key: 'water', value: 1 } }, win)
    await flush()

    expect(onActivity).not.toHaveBeenCalled()
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: 'vitality-host', type: 'report:error', id: 'r2', reason: 'failed' }, '*',
    )
  })

  test('a legacy void handler (no result) still counts as activity', async () => {
    const onActivity = jest.fn()
    const onReport = jest.fn() // returns undefined
    const { result } = renderHook(() => useTileHost('user-1', onActivity, onReport))
    const win = fakeWindow()
    act(() => { result.current.register(win, 'tile-a') })

    dispatch({ source: 'vitality-tile', type: 'report', id: 'r3', stream: { key: 'water', value: 1 } }, win)
    await flush()

    expect(onActivity).toHaveBeenCalledWith({ tileId: 'tile-a', type: 'report', count: 1 })
  })
})
