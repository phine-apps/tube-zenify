import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Background Service Worker (src/background/index.js)', () => {
  let onMessageHandler

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    chrome.runtime.lastError = null
    chrome.runtime.onMessage.addListener.mockImplementation((fn) => {
      onMessageHandler = fn
    })
    chrome.storage.local.get.mockImplementation((_keys, cb) => cb({}))
    chrome.tabs.query.mockImplementation((_q, cb) => cb([]))
    chrome.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb({}))
    chrome.runtime.sendMessage.mockReturnValue(Promise.resolve())
    global.fetch = vi.fn()

    await import('../src/background/index.js')
  })

  it('reloads only a single non-watch tab when ALL YouTube tabs fail to respond (Regression #2)', () => {
    chrome.tabs.query.mockImplementation((_q, cb) =>
      cb([
        { id: 10, active: true, url: 'https://www.youtube.com/watch?v=abc' },
        { id: 20, active: false, url: 'https://www.youtube.com/' },
        {
          id: 30,
          active: false,
          url: 'https://www.youtube.com/feed/subscriptions',
        },
      ])
    )
    chrome.tabs.sendMessage.mockImplementation((_id, _msg, cb) => {
      chrome.runtime.lastError = { message: 'Receiving end does not exist.' }
      cb(undefined)
      chrome.runtime.lastError = null
    })

    onMessageHandler({ action: 'START_SCRAPE' }, {}, vi.fn())

    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3)
    expect(chrome.tabs.reload).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.reload).toHaveBeenCalledWith(20)
  })

  it('falls back to the next tab without reloading when a secondary tab responds', () => {
    chrome.tabs.query.mockImplementation((_q, cb) =>
      cb([
        { id: 10, active: true, url: 'https://www.youtube.com/watch?v=abc' },
        { id: 20, active: false, url: 'https://www.youtube.com/' },
      ])
    )
    chrome.tabs.sendMessage.mockImplementation((tabId, _msg, cb) => {
      if (tabId === 10) {
        chrome.runtime.lastError = { message: 'Tab asleep' }
        cb(undefined)
      } else {
        chrome.runtime.lastError = null
        cb({
          channels: { UC1: { id: 'UC1', name: 'Working Channel' } },
          playlists: { PL1: { id: 'PL1', name: 'My Playlist' } },
          isLoggedIn: true,
          gaiaId: 'GAIA_1',
        })
      }
    })

    onMessageHandler({ action: 'START_SCRAPE' }, {}, vi.fn())

    expect(chrome.tabs.reload).not.toHaveBeenCalled()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CHANNELS_UPDATED',
        gaiaId: 'GAIA_1',
      })
    )
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLAYLISTS_UPDATED',
        gaiaId: 'GAIA_1',
      })
    )
  })

  it('passes authuser query param for multi-account sessionIndex in FETCH_CHANNELS_BACKEND', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        '<script>var ytInitialData = {"contents":{"gridChannelRenderer":{"channelId":"UC_MULTI","title":{"simpleText":"Multi Account Ch"}}}};</script>',
      json: async () => ({}),
    })

    const sendResponse = vi.fn()
    const isAsync = onMessageHandler(
      {
        action: 'FETCH_CHANNELS_BACKEND',
        apiKey: 'TEST_KEY',
        context: { client: { clientName: 'WEB' } },
        clientVersion: '2.20250101.00.00',
        sessionIndex: '2',
      },
      {},
      sendResponse
    )

    expect(isAsync).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())

    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.youtube.com/feed/channels?authuser=2',
      expect.objectContaining({ credentials: 'include' })
    )
    expect(sendResponse).toHaveBeenCalledWith({
      channels: expect.objectContaining({
        UC_MULTI: expect.objectContaining({ name: 'Multi Account Ch' }),
      }),
    })
  })

  it('does not produce unhandled rejections when sidepanel is closed during START_SCRAPE', () => {
    chrome.runtime.sendMessage.mockReturnValue(
      Promise.reject(new Error('Receiving end does not exist'))
    )
    expect(() =>
      onMessageHandler({ action: 'START_SCRAPE' }, {}, vi.fn())
    ).not.toThrow()
  })
})
