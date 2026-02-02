/**
 * Identity verification for YouTube users
 */

// This will likely need to be run in content script context to access DOM/ytcfg
// or communicated via message passing if called from sidepanel

export const Identity = {
  /**
   * Extract GAIA ID from YouTube DOM (ytcfg)
   * Intended to be run in Content Script
   * @returns {string|null} GAIA ID or null if not found
   */
  extractGaiaId: () => {
    try {
      if (typeof document === 'undefined') return null

      const getFromContext = (context) => {
        if (context.user && context.user.onBehalfOfUser) {
          return context.user.onBehalfOfUser
        }
        return null
      }

      const getFromDataSyncId = (dataSyncId) => {
        if (dataSyncId && typeof dataSyncId === 'string') {
          return dataSyncId.split('||')[0]
        }
        return null
      }

      // Strategy 1: Search script tags (Works in Content Script)
      const scripts = document.querySelectorAll('script')
      for (const script of scripts) {
        const text = script.textContent
        if (text.includes('INNERTUBE_CONTEXT')) {
          const startKey = '"INNERTUBE_CONTEXT":'
          const startIdx = text.indexOf(startKey)
          if (startIdx !== -1) {
            const afterKey = text.substring(startIdx + startKey.length).trim()
            if (afterKey.startsWith('{')) {
              let braceCount = 0
              let endIdx = -1
              for (let i = 0; i < afterKey.length; i++) {
                if (afterKey[i] === '{') braceCount++
                else if (afterKey[i] === '}') braceCount--
                if (braceCount === 0) {
                  endIdx = i
                  break
                }
              }

              if (endIdx !== -1) {
                try {
                  const contextStr = afterKey.substring(0, endIdx + 1)
                  const context = JSON.parse(contextStr)
                  const id = getFromContext(context)
                  if (id) return id
                } catch (_e) {
                  // Ignore parse errors
                }
              }
            }
          }
        }

        // Fallback within script text for DATASYNC_ID
        if (text.includes('DATASYNC_ID')) {
          const dsMatch = text.match(/"DATASYNC_ID":"([^"]+)"/)
          if (dsMatch) {
            const id = getFromDataSyncId(dsMatch[1])
            if (id) return id
          }
        }
      }

      // Strategy 2: Direct ytcfg (Works if script is injected OR in some environments)
      if (typeof window !== 'undefined' && window.ytcfg && window.ytcfg.data_) {
        const id =
          getFromContext(window.ytcfg.data_.INNERTUBE_CONTEXT || {}) ||
          getFromDataSyncId(window.ytcfg.data_.DATASYNC_ID)
        if (id) return id
      }

      return null
    } catch (e) {
      console.error('TubeZenify: Failed to extract GAIA ID', e)
      return null
    }
  },
}
