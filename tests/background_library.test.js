import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchSidebarGuide,
  findChannelsAndContinuation,
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
})
