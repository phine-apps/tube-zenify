import { describe, it, expect, beforeEach } from 'vitest'
import { Identity, extractBalancedJsonObject } from '../src/utils/identity'
import {
  resolveChannelUrl,
  sanitizeYouTubeUrl,
  openYouTubeUrl,
} from '../src/utils/navigation'

describe('Utility Modules', () => {
  describe('Identity', () => {
    beforeEach(() => {
      // Mock window.ytcfg
      global.window.ytcfg = undefined
    })

    it('extractGaiaId returns null if window undefined (simulated)', () => {
      // In JSDOM window is always defined, but we can verify it handles missing properties
      expect(Identity.extractGaiaId()).toBeNull()
    })

    it('extractGaiaId returns null if ytcfg missing', () => {
      global.window.ytcfg = undefined
      expect(Identity.extractGaiaId()).toBeNull()
    })

    it('extractGaiaId returns valid ID when present in INNERTUBE_CONTEXT', () => {
      global.window.ytcfg = {
        data_: {
          INNERTUBE_CONTEXT: {
            user: {
              onBehalfOfUser: 'GAIA_12345',
            },
          },
        },
      }
      expect(Identity.extractGaiaId()).toBe('GAIA_12345')
    })

    it('extractGaiaId returns valid ID from DATASYNC_ID fallback', () => {
      global.window.ytcfg = {
        data_: {
          DATASYNC_ID: 'GAIA_KB_ABC||123',
        },
      }
      expect(Identity.extractGaiaId()).toBe('GAIA_KB_ABC')
    })

    it('returns null on error or structure mismatch', () => {
      global.window.ytcfg = { data_: {} }
      expect(Identity.extractGaiaId()).toBeNull()
    })
  })

  describe('resolveChannelUrl', () => {
    it('keeps home URL when openChannelTab is home', () => {
      expect(
        resolveChannelUrl('https://www.youtube.com/@handle', '@handle', 'home')
      ).toBe('https://www.youtube.com/@handle')
      expect(resolveChannelUrl(undefined, 'UC123', 'home')).toBe(
        'https://www.youtube.com/channel/UC123'
      )
    })

    it('appends /videos when openChannelTab is videos without duplicating', () => {
      expect(
        resolveChannelUrl(
          'https://www.youtube.com/@handle',
          '@handle',
          'videos'
        )
      ).toBe('https://www.youtube.com/@handle/videos')
      expect(
        resolveChannelUrl(
          'https://www.youtube.com/channel/UC123/',
          'UC123',
          'videos'
        )
      ).toBe('https://www.youtube.com/channel/UC123/videos')
      expect(
        resolveChannelUrl(
          'https://www.youtube.com/@handle/videos',
          '@handle',
          'videos'
        )
      ).toBe('https://www.youtube.com/@handle/videos')
      expect(
        resolveChannelUrl(
          'https://www.youtube.com/@handle/featured',
          '@handle',
          'videos'
        )
      ).toBe('https://www.youtube.com/@handle/videos')
      expect(
        resolveChannelUrl(
          'https://www.youtube.com/channel/UC123/streams',
          'UC123',
          'videos'
        )
      ).toBe('https://www.youtube.com/channel/UC123/videos')
    })

    it('rejects non-YouTube and dangerous URLs in sanitizeYouTubeUrl and openYouTubeUrl', () => {
      expect(sanitizeYouTubeUrl('javascript:alert(1)')).toBeNull()
      expect(
        sanitizeYouTubeUrl('https://evil.example.com/channel/UC1')
      ).toBeNull()
      expect(sanitizeYouTubeUrl('http://www.youtube.com/@handle')).toBeNull()
      expect(sanitizeYouTubeUrl('https://www.youtube.com/@handle')).toBe(
        'https://www.youtube.com/@handle'
      )

      chrome.tabs.update.mockClear()
      chrome.tabs.create.mockClear()
      openYouTubeUrl('https://evil.example.com/')
      expect(chrome.tabs.update).not.toHaveBeenCalled()
      expect(chrome.tabs.create).not.toHaveBeenCalled()
    })

    it('extractBalancedJsonObject handles braces inside quoted strings', () => {
      const parsed = extractBalancedJsonObject(
        '{"user":{"label":"a } { \\"quoted\\" } b"},"ok":true}, trailing'
      )
      expect(parsed).toEqual({
        user: { label: 'a } { "quoted" } b' },
        ok: true,
      })
    })
  })
})
