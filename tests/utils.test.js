import { describe, it, expect, beforeEach } from 'vitest'
import { Identity } from '../src/utils/identity'

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
})
