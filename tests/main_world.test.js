import { describe, it, expect, beforeEach } from 'vitest'

let mainWorldLoaded = false
async function ensureMainWorldLoaded() {
  if (mainWorldLoaded) return
  await import('../src/content/main-world.js')
  mainWorldLoaded = true
}

function requestMainWorld(requestEvent, responseEvent) {
  return new Promise((resolve) => {
    const handler = (e) => {
      window.removeEventListener(responseEvent, handler)
      resolve(e.detail)
    }
    window.addEventListener(responseEvent, handler)
    window.dispatchEvent(new CustomEvent(requestEvent))
  })
}

describe('MAIN World Script (src/content/main-world.js)', () => {
  beforeEach(async () => {
    document.body.innerHTML = ''
    delete window.ytInitialData
    delete window.ytcfg
    window.history.replaceState({}, '', '/')
    await ensureMainWorldLoaded()
  })

  it('extracts channels from ytd-guide-renderer even when __data__ contains circular references and DOM nodes', async () => {
    const guide = document.createElement('ytd-guide-renderer')
    const circularData = {
      sections: [
        {
          guideEntryRenderer: {
            channelId: 'UC_CIRCULAR',
            formattedTitle: { simpleText: 'Circular Channel' },
            thumbnail: {
              thumbnails: [{ url: 'https://yt3.ggpht.com/avatar.jpg' }],
            },
            badges: { liveBroadcasting: true },
          },
        },
      ],
      hostElement: guide,
    }
    circularData.self = circularData
    guide.__data__ = circularData
    document.body.appendChild(guide)

    const result = await requestMainWorld(
      'TUBE_ZENIFY_REQUEST_GUIDE_DATA',
      'TUBE_ZENIFY_RESPONSE_GUIDE_DATA'
    )

    expect(result).toEqual([
      {
        id: 'UC_CIRCULAR',
        name: 'Circular Channel',
        icon: 'https://yt3.ggpht.com/avatar.jpg',
        isLive: true,
        hasNewContent: false,
      },
    ])
  })

  it('scans ytd-browse on /feed/playlists even when window.ytInitialData is absent and __data has cycles', async () => {
    window.history.replaceState({}, '', '/feed/playlists')

    const browse = document.createElement('ytd-browse')
    const cyclicBrowseData = {
      items: [
        {
          lockupViewModel: {
            contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
            contentId: 'PL_SPA_123',
            metadata: {
              lockupMetadataViewModel: {
                title: { content: 'SPA Playlist' },
              },
            },
            contentImage: {
              collectionThumbnailViewModel: {
                primaryThumbnail: {
                  thumbnailViewModel: {
                    image: {
                      sources: [{ url: 'https://i.ytimg.com/vi/abc/hq.jpg' }],
                    },
                  },
                },
              },
            },
          },
        },
      ],
      el: browse,
    }
    cyclicBrowseData.parent = cyclicBrowseData
    browse.__data = cyclicBrowseData
    document.body.appendChild(browse)

    const result = await requestMainWorld(
      'TUBE_ZENIFY_REQUEST_PLAYLISTS_DATA',
      'TUBE_ZENIFY_RESPONSE_PLAYLISTS_DATA'
    )

    expect(result).toEqual([
      {
        id: 'PL_SPA_123',
        name: 'SPA Playlist',
        icon: 'https://i.ytimg.com/vi/abc/hq.jpg',
        url: 'https://www.youtube.com/playlist?list=PL_SPA_123',
      },
    ])
  })

  it('returns ytcfg metadata via TUBE_ZENIFY_REQUEST_YTCFG', async () => {
    const map = {
      INNERTUBE_API_KEY: 'KEY_123',
      INNERTUBE_CONTEXT: { client: { clientName: 'WEB' } },
      INNERTUBE_CLIENT_VERSION: '2.20260101',
      SESSION_INDEX: '1',
      DELEGATED_SESSION_ID: 'BRAND_99',
      VISITOR_DATA: 'VIS_1',
    }
    window.ytcfg = { get: (k) => map[k] }

    const result = await requestMainWorld(
      'TUBE_ZENIFY_REQUEST_YTCFG',
      'TUBE_ZENIFY_RESPONSE_YTCFG'
    )

    expect(result).toEqual({
      apiKey: 'KEY_123',
      context: { client: { clientName: 'WEB' } },
      clientVersion: '2.20260101',
      sessionIndex: '1',
      delegatedSessionId: 'BRAND_99',
      visitorData: 'VIS_1',
    })
  })
})
