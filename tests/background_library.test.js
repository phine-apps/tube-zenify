import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildYouTubeAuthHeaders,
  fetchPlaylistsPipeline,
  fetchSidebarGuide,
  fetchSidebarGuidePlaylists,
  findChannelsAndContinuation,
  findPlaylistsAndContinuation,
  normalizePlaylistId,
  parseYtInitialData,
} from '../src/background/library'

// Mock global fetch
const fetchMock = vi.fn()
global.fetch = fetchMock

describe('Background Library', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  })

  describe('fetchSidebarGuide', () => {
    it('sanitizes context by removing tracking params and resetting URL', async () => {
      const apiKey = 'TEST_API_KEY'
      const context = {
        client: {
          hl: 'en',
          gl: 'US',
          originalUrl: 'https://www.youtube.com/watch?v=123', // Dirty URL
          mainAppWebInfo: {
            graftUrl: '/watch?v=123',
            webPageType: 'WEB_PAGE_TYPE_WATCH',
          },
          configInfo: {
            appInstallData: 'some_encoded_data',
          },
        },
        clickTracking: { param: 'tracking_data' }, // Should be removed
        adSignalsInfo: { param: 'ad_data' }, // Should be removed
        other: 'keep',
      }
      const clientVersion = '1.0.0'

      await fetchSidebarGuide(apiKey, context, clientVersion)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const callArgs = fetchMock.mock.calls[0]
      const url = callArgs[0]
      const options = callArgs[1]
      const body = JSON.parse(options.body)

      expect(url).toContain(apiKey)
      expect(body.context).toBeDefined()

      // Check sanitization
      expect(body.context.client.originalUrl).toBe('https://www.youtube.com/')
      // mainAppWebInfo should be removed to avoid conflicting page type signals
      expect(body.context.client.mainAppWebInfo).toBeUndefined()
      // configInfo should be removed as it contains page-specific signals (appInstallData)
      expect(body.context.client.configInfo).toBeUndefined()

      expect(body.context.clickTracking).toBeUndefined()
      expect(body.context.adSignalsInfo).toBeUndefined()
      expect(body.context.other).toBe('keep') // Preserves other fields

      // Verify original context is not mutated
      expect(context.client.originalUrl).toContain('watch?v=123')
      expect(context.clickTracking).toBeDefined()
    })

    it('handles fetch errors gracefully', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'))
      const result = await fetchSidebarGuide('key', {}, 'v1')
      expect(result).toEqual({})
    })
  })

  describe('findChannelsAndContinuation', () => {
    it('extracts channels correctly', () => {
      const data = {
        items: [
          {
            guideEntryRenderer: {
              channelId: 'UC123',
              title: { simpleText: 'Test Channel' },
              thumbnail: { thumbnails: [{ url: 'https://icon.com' }] },
            },
          },
        ],
      }

      const result = findChannelsAndContinuation(data)
      expect(result.channels['UC123']).toBeDefined()
      expect(result.channels['UC123'].name).toBe('Test Channel')
    })

    it('detects Status Live correctly', () => {
      const data = {
        items: [
          {
            guideEntryRenderer: {
              channelId: 'UC123',
              title: { simpleText: 'Live Channel' },
              badges: { liveBroadcasting: true },
            },
          },
        ],
      }
      const result = findChannelsAndContinuation(data)
      expect(result.channels['UC123'].isLive).toBe(true)
    })
  })

  describe('normalizePlaylistId', () => {
    it('strips VL prefix and filters system playlists', () => {
      expect(normalizePlaylistId('VLPLabc123')).toBe('PLabc123')
      expect(normalizePlaylistId('PLxyz')).toBe('PLxyz')
      expect(normalizePlaylistId('VLWL')).toBeNull()
      expect(normalizePlaylistId('VLLL')).toBeNull()
      expect(normalizePlaylistId('WL')).toBeNull()
      expect(normalizePlaylistId('FEhistory')).toBeNull()
      expect(normalizePlaylistId('UC123')).toBeNull()
    })
  })

  describe('findPlaylistsAndContinuation', () => {
    it('extracts gridPlaylistRenderer and continuation token', () => {
      const data = {
        items: [
          {
            gridPlaylistRenderer: {
              playlistId: 'PL_GRID_1',
              title: { runs: [{ text: 'Coding Music' }] },
              thumbnail: {
                thumbnails: [{ url: '//img.youtube.com/vi/1/default.jpg' }],
              },
              videoCountText: { runs: [{ text: '24 videos' }] },
            },
          },
          {
            continuationItemRenderer: {
              continuationEndpoint: {
                continuationCommand: { token: 'NEXT_PAGE_TOKEN' },
              },
            },
          },
        ],
      }

      const result = findPlaylistsAndContinuation(data)
      expect(result.playlists['PL_GRID_1']).toEqual({
        id: 'PL_GRID_1',
        name: 'Coding Music',
        icon: 'https://img.youtube.com/vi/1/default.jpg',
        videoCount: '24 videos',
        url: 'https://www.youtube.com/playlist?list=PL_GRID_1',
      })
      expect(result.continuation).toBe('NEXT_PAGE_TOKEN')
    })

    it('extracts modern lockupViewModel playlists', () => {
      const data = {
        items: [
          {
            lockupViewModel: {
              contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
              contentId: 'PL_LOCKUP_1',
              metadata: {
                lockupMetadataViewModel: {
                  title: { content: 'Design Talks' },
                },
              },
              contentImage: {
                collectionThumbnailViewModel: {
                  primaryThumbnail: {
                    thumbnailViewModel: {
                      image: {
                        sources: [{ url: 'https://i.ytimg.com/vi/abc/hq.jpg' }],
                      },
                      overlays: [
                        {
                          thumbnailOverlayBadgeViewModel: {
                            thumbnailBadges: [
                              {
                                thumbnailBadgeViewModel: { text: '12 videos' },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      }

      const result = findPlaylistsAndContinuation(data)
      expect(result.playlists['PL_LOCKUP_1']).toEqual({
        id: 'PL_LOCKUP_1',
        name: 'Design Talks',
        icon: 'https://i.ytimg.com/vi/abc/hq.jpg',
        videoCount: '12 videos',
        url: 'https://www.youtube.com/playlist?list=PL_LOCKUP_1',
      })
    })

    it('extracts guideEntryRenderer playlists while ignoring Watch Later and Liked Videos', () => {
      const data = {
        items: [
          {
            guideEntryRenderer: {
              formattedTitle: { simpleText: 'Watch Later' },
              navigationEndpoint: { browseEndpoint: { browseId: 'VLWL' } },
            },
          },
          {
            guideEntryRenderer: {
              formattedTitle: { simpleText: 'Liked Videos' },
              navigationEndpoint: { browseEndpoint: { browseId: 'VLLL' } },
            },
          },
          {
            guideEntryRenderer: {
              formattedTitle: { simpleText: 'Saved Jazz' },
              navigationEndpoint: { browseEndpoint: { browseId: 'VLPL_JAZZ' } },
            },
          },
        ],
      }

      const result = findPlaylistsAndContinuation(data)
      expect(Object.keys(result.playlists)).toEqual(['PL_JAZZ'])
      expect(result.playlists['PL_JAZZ'].name).toBe('Saved Jazz')
    })
  })

  describe('fetchSidebarGuidePlaylists', () => {
    it('fetches and filters playlists from guide API', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              guideEntryRenderer: {
                formattedTitle: { simpleText: 'Watch Later' },
                navigationEndpoint: { browseEndpoint: { browseId: 'VLWL' } },
              },
            },
            {
              guideEntryRenderer: {
                formattedTitle: { simpleText: 'Study Lo-Fi' },
                navigationEndpoint: {
                  browseEndpoint: { browseId: 'VLPL_LOFI' },
                },
              },
            },
          ],
        }),
      })

      const playlists = await fetchSidebarGuidePlaylists('KEY', {}, '1.0')
      expect(Object.keys(playlists)).toEqual(['PL_LOFI'])
      expect(playlists['PL_LOFI'].url).toBe(
        'https://www.youtube.com/playlist?list=PL_LOFI'
      )
    })
  })

  describe('parseYtInitialData', () => {
    it('extracts JSON safely even when strings contain }; and newlines', () => {
      const html = `
        <html><script>
          var ytInitialData = {
            "header": { "title": "hello }; world" },
            "items": [1, 2]
          };
          var other = 1;
        </script></html>
      `
      expect(parseYtInitialData(html)).toEqual({
        header: { title: 'hello }; world' },
        items: [1, 2],
      })
    })

    it('extracts window["ytInitialData"] assignments', () => {
      const html = `<script>window["ytInitialData"] = {"ok":true};</script>`
      expect(parseYtInitialData(html)).toEqual({ ok: true })
    })
  })

  describe('additional playlist and auth helpers', () => {
    it('extracts lockupViewModel playlists using watchEndpoint.playlistId and contentRows videoCount', () => {
      const data = {
        items: [
          {
            lockupViewModel: {
              contentId: '',
              rendererContext: {
                commandContext: {
                  onTap: {
                    innertubeCommand: {
                      watchEndpoint: {
                        videoId: 'v123',
                        playlistId: 'PL_WATCH_EP',
                      },
                    },
                  },
                },
              },
              metadata: {
                lockupMetadataViewModel: {
                  title: { content: 'Watch Later Style Playlist' },
                  metadata: {
                    contentMetadataViewModel: {
                      metadataRows: [
                        {
                          metadataParts: [{ text: { content: '42 videos' } }],
                        },
                      ],
                    },
                  },
                },
              },
              contentImage: {
                collectionThumbnailViewModel: {
                  primaryThumbnail: {
                    thumbnailViewModel: {
                      image: {
                        sources: [
                          { url: 'https://i.ytimg.com/vi/v123/hq.jpg' },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      }

      const result = findPlaylistsAndContinuation(data)
      expect(result.playlists['PL_WATCH_EP']).toEqual({
        id: 'PL_WATCH_EP',
        name: 'Watch Later Style Playlist',
        icon: 'https://i.ytimg.com/vi/v123/hq.jpg',
        videoCount: '42 videos',
        url: 'https://www.youtube.com/playlist?list=PL_WATCH_EP',
      })
    })

    it('extracts guideEntryRenderer playlists from commandMetadata URL', () => {
      const data = {
        items: [
          {
            guideEntryRenderer: {
              formattedTitle: { simpleText: 'URL Playlist' },
              navigationEndpoint: {
                commandMetadata: {
                  webCommandMetadata: { url: '/playlist?list=PL_FROM_URL' },
                },
              },
            },
          },
        ],
      }

      const result = findPlaylistsAndContinuation(data)
      expect(result.playlists['PL_FROM_URL']?.name).toBe('URL Playlist')
    })

    it('builds SAPISIDHASH Authorization header only when sapisid is present', async () => {
      expect(await buildYouTubeAuthHeaders('')).toEqual({})

      const headers = await buildYouTubeAuthHeaders('test_sapisid_value', {
        sessionIndex: 2,
        delegatedSessionId: '100200',
        visitorData: 'VISITOR_1',
      })
      expect(headers.Authorization).toMatch(/^SAPISIDHASH \d+_[0-9a-f]{40}$/)
      expect(headers['X-Origin']).toBe('https://www.youtube.com')
      expect(headers['X-Goog-AuthUser']).toBe('2')
      expect(headers['X-Goog-PageId']).toBe('100200')
      expect(headers['X-Goog-Visitor-Id']).toBe('VISITOR_1')
    })

    it('extracts lockupViewModel playlists via serialCommand and metadata commandRuns', () => {
      const data = {
        items: [
          {
            lockupViewModel: {
              contentId: '',
              rendererContext: {
                commandContext: {
                  onTap: {
                    serialCommand: {
                      commands: [
                        { logGestureCommand: {} },
                        {
                          innertubeCommand: {
                            browseEndpoint: { browseId: 'VLPL_SERIAL' },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              metadata: {
                lockupMetadataViewModel: {
                  title: { content: 'Serial Command Playlist' },
                },
              },
            },
          },
          {
            lockupViewModel: {
              contentId: '',
              metadata: {
                lockupMetadataViewModel: {
                  title: { content: 'Metadata CommandRun Playlist' },
                  metadata: {
                    contentMetadataViewModel: {
                      metadataRows: [
                        {
                          metadataParts: [
                            {
                              text: {
                                content: 'View full playlist',
                                commandRuns: [
                                  {
                                    onTap: {
                                      innertubeCommand: {
                                        commandMetadata: {
                                          webCommandMetadata: {
                                            url: '/playlist?list=PL_CMDRUN',
                                          },
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      }

      const result = findPlaylistsAndContinuation(data)
      expect(result.playlists['PL_SERIAL']?.name).toBe(
        'Serial Command Playlist'
      )
      expect(result.playlists['PL_CMDRUN']?.name).toBe(
        'Metadata CommandRun Playlist'
      )
    })

    it('falls back to FElibrary in fetchPlaylistsPipeline when feed HTML and FEplaylist_aggregation are empty', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            '<html><script>var ytInitialData = {};</script></html>',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            contents: {
              items: [
                {
                  gridPlaylistRenderer: {
                    playlistId: 'PL_FROM_LIB',
                    title: { simpleText: 'Library Playlist' },
                  },
                },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })

      const playlists = await fetchPlaylistsPipeline({
        apiKey: 'KEY',
        context: { client: { hl: 'ja' } },
        clientVersion: '2.2026',
        sapisid: 'SAPISID_TEST',
        sessionIndex: '1',
        sourceLabel: 'test',
      })

      expect(playlists['PL_FROM_LIB']?.name).toBe('Library Playlist')
      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(fetchMock.mock.calls[0][0]).toContain('authuser=1')
    })

    it('skips non-object ytInitialData references before finding the JSON literal', () => {
      const html = `
        <script>
          window.ytInitialData = someInitializer;
          var ytInitialData = {"items": ["ok"]};
        </script>
      `
      expect(parseYtInitialData(html)).toEqual({ items: ['ok'] })
    })
  })
})
