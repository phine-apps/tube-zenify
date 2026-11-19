/**
 * Identity verification for YouTube users
 */

// This will likely need to be run in content script context to access DOM/ytcfg
// or communicated via message passing if called from sidepanel

/**
 * Extracts a JSON object literal starting at the first '{' in `text`
 * using string-aware brace matching.
 */
export function extractBalancedJsonObject(text) {
  if (!text || !text.startsWith('{')) return null
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (ch === '\\') {
        isEscaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(0, i + 1))
        } catch (_e) {
          return null
        }
      }
    }
  }
  return null
}

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
            const context = extractBalancedJsonObject(afterKey)
            if (context) {
              const id = getFromContext(context)
              if (id) return id
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
