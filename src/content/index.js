import { Identity } from '../utils/identity.js'

// Helper to extract channel data from the DOM (fallback for visible items)
export function scrapeChannels() {
  const channels = {}
  const items = document.querySelectorAll(
    'ytd-guide-entry-renderer, ytd-channel-renderer, ytd-grid-channel-renderer'
  )

  items.forEach((item) => {
    const anchor = item.querySelector('a') || item.querySelector('#main-link')
    const titleSpan =
      item.querySelector('.title') ||
      item.querySelector('#text') ||
      item.querySelector('#channel-title')

    if (!anchor || !titleSpan) return

    const href = anchor.getAttribute('href')
    if (!href || !/^\/(channel\/|c\/|user\/|@)/.test(href)) return
    if (href.includes('/feed/') || href.includes('/playlist')) return

    let id = href.startsWith('/') ? href.substring(1) : href
    if (id.startsWith('channel/')) id = id.split('/')[1]

    // Strict filter: User channels typically start with UC
    // System channels (Music, Sports, Gaming) also start with UC but usually come from
    // diff sections. We'll rely on background feed for authoritative list,
    // but here we filter obvious garbage.
    // 1. Strict ID Format Check (White List)
    // Only allow standard Channel IDs (start with 'UC') or Handles (start with '@').
    // This blocks navigation items like 'Home' (/), 'History' (/feed/history), etc.
    // without maintaining a blacklist.
    if (!id.startsWith('UC') && !id.startsWith('@')) return

    const name = titleSpan.textContent.trim()
    if (!name) return

    // Simple status check for visible items
    const isLive =
      !!item.querySelector("[overlay-style='LIVE']") ||
      !!item.querySelector('[class*="badge-style-type-live-now"]')
    const hasNewContent =
      !!item.querySelector('#newness-dot') ||
      item.getAttribute('line-end-style') === 'dot'

    // Filter out items that match system ID patterns or lack proper visuals.

    const img = item.querySelector('yt-img-shadow img')
    const ytImgShadow = item.querySelector('yt-img-shadow')

    // STRICT FILTER: Real channels have a visible avatar image.
    // System items (Report History, Music, etc) often hide the img-shadow
    // and use an SVG icon instead, OR they have no src.
    if (ytImgShadow && ytImgShadow.hasAttribute('hidden')) return

    const iconSrc = img?.src

    // Must have a valid HTTPS image source.
    // Data URIs or empty sources usually indicate a loading state or a system icon.
    if (!iconSrc || !iconSrc.startsWith('https://')) {
      return
    }

    const icon = iconSrc

    channels[id] = {
      id,
      name,
      icon,
      isLive,
      hasNewContent,
      url: href.startsWith('http') ? href : `https://www.youtube.com${href}`,
    }
  })

  return { channels }
}

/**
 * Extracts YouTube internal configuration for API calls
 */
function extractYouTubeConfig() {
  const scripts = document.querySelectorAll('script')
  let apiKey = ''
  let context = {}

  for (const script of scripts) {
    const text = script.textContent

    if (!apiKey && text.includes('INNERTUBE_API_KEY')) {
      const apiMatch = text.match(/"INNERTUBE_API_KEY":"([^"]+)"/)
      if (apiMatch) apiKey = apiMatch[1]
    }

    if (
      Object.keys(context).length === 0 &&
      text.includes('INNERTUBE_CONTEXT')
    ) {
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
            const contextStr = afterKey.substring(0, endIdx + 1)
            try {
              context = JSON.parse(contextStr)
            } catch (e) {
              console.error('TubeZenify: Failed to parse context string', e)
            }
          }
        }
      }
    }

    if (apiKey && Object.keys(context).length > 0) break
  }

  if (!apiKey) {
    const apiMatch = document.documentElement.innerHTML.match(
      /"INNERTUBE_API_KEY":"([^"]+)"/
    )
    if (apiMatch) apiKey = apiMatch[1]
  }

  let clientVersion = ''
  const versionMatch = document.documentElement.innerHTML.match(
    /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/
  )
  if (versionMatch) clientVersion = versionMatch[1]

  // Cache credentials for background use
  // ONLY cache if NOT on a watch page to ensure we keep a "clean" BROWSE context
  const isWatchPage = window.location.pathname.startsWith('/watch')
  if (apiKey && Object.keys(context).length > 0 && !isWatchPage) {
    chrome.storage.local.set({
      yt_credentials: { apiKey, context, clientVersion, timestamp: Date.now() },
    })
  }

  return { apiKey, context, clientVersion }
}

/**
 * Delegates fetching to background script to bypass CSP
 */
export async function fetchChannelsFromFeed() {
  let { apiKey, context, clientVersion } = extractYouTubeConfig()
  const isWatchPage = window.location.pathname.startsWith('/watch')

  // If on Watch page, prefer cached credentials (which are likely from Home/Browse)
  // because the Watch page context is often polluted and fails to fetch the Guide
  if (isWatchPage) {
    try {
      const cached = await chrome.storage.local.get('yt_credentials')
      if (
        cached.yt_credentials &&
        cached.yt_credentials.apiKey &&
        cached.yt_credentials.context
      ) {
        apiKey = cached.yt_credentials.apiKey
        context = cached.yt_credentials.context
        clientVersion = cached.yt_credentials.clientVersion
      }
    } catch (_e) {
      // Ignore fallback error
    }
  }

  if (!apiKey) {
    console.warn('TubeZenify: Could not find API key for background fetch.')
    return {}
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'FETCH_CHANNELS_BACKEND',
      apiKey,
      context,
      clientVersion,
    })

    if (response && response.channels) {
      return response.channels
    } else if (response && response.error) {
      throw new Error(response.error)
    }
  } catch (e) {
    console.error('TubeZenify: Background fetch failed', e)
    throw e
  }

  return {}
}

// Helper to merge channels from multiple sources
export function mergeChannels(fetched, scraped) {
  const merged = { ...fetched }
  const nameToId = {}

  // 1. Map names to IDs from the most reliable source (API/Fetched)
  Object.values(fetched).forEach((ch) => {
    if (ch.name) {
      const normalized = ch.name.toLowerCase().replace(/\s+/g, ' ').trim()
      nameToId[normalized] = ch.id
    }
  })

  // 2. Merge Scraped data (potentially handles vs IDs)
  if (scraped) {
    const scrapedList = Array.isArray(scraped)
      ? scraped
      : Object.values(scraped)
    scrapedList.forEach((scrapedChannel) => {
      const normalizedName = scrapedChannel.name
        ?.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
      const canonicalId = merged[scrapedChannel.id]
        ? scrapedChannel.id
        : nameToId[normalizedName]

      if (canonicalId && merged[canonicalId]) {
        // Update existing
        merged[canonicalId] = {
          ...merged[canonicalId],
          isLive: merged[canonicalId].isLive || scrapedChannel.isLive,
          hasNewContent:
            merged[canonicalId].hasNewContent || scrapedChannel.hasNewContent,
          // Prefer scraped icon/name if available but keep ID
          name: scrapedChannel.name || merged[canonicalId].name,
          icon: scrapedChannel.icon || merged[canonicalId].icon,
        }
      } else {
        // Add as new (this handles handles that didn't match any fetched ID)
        merged[scrapedChannel.id] = {
          ...scrapedChannel,
          url:
            scrapedChannel.url ||
            `https://www.youtube.com/channel/${scrapedChannel.id}`,
        }
        if (scrapedChannel.name) {
          nameToId[normalizedName] = scrapedChannel.id
        }
      }
    })
  }

  return merged
}

// Helper to scrape data from page context (internal guide data)
async function scrapeFromPageContext() {
  return new Promise((resolve) => {
    const handler = (event) => {
      window.removeEventListener('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', handler)
      try {
        const data = event.detail
        resolve(data || [])
      } catch (_e) {
        resolve([])
      }
    }
    window.addEventListener('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', handler)

    // Trigger extraction in the MAIN world script
    window.dispatchEvent(new CustomEvent('TUBE_ZENIFY_REQUEST_GUIDE_DATA'))

    // Safety timeout
    setTimeout(() => {
      window.removeEventListener('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', handler)
      resolve([])
    }, 2000)
  })
}

// Listen for messages from Side Panel
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_CHANNELS') {
    ;(async () => {
      try {
        const [scrapedResult, fetchedChannels, pageContextChannels] =
          await Promise.all([
            Promise.resolve(scrapeChannels()),
            fetchChannelsFromFeed(),
            scrapeFromPageContext(),
          ])

        const gaiaId = Identity.extractGaiaId()
        const isLoggedIn = !!(
          gaiaId ||
          document.querySelector(
            'ytd-masthead #buttons ytd-button-renderer a[href*="ServiceLogin"]'
          ) === null
        )

        // Merge all sources using the improved helper
        let finalChannels = mergeChannels(
          fetchedChannels,
          scrapedResult.channels
        )
        finalChannels = mergeChannels(finalChannels, pageContextChannels)

        sendResponse({
          channels: finalChannels,
          isLoggedIn: isLoggedIn,
          gaiaId: gaiaId,
        })
      } catch (e) {
        console.error('TubeZenify: GET_CHANNELS Error:', e)
        sendResponse({
          channels: {},
          isLoggedIn: false,
          error: e.message || e.toString(),
        })
      }
    })()
    return true
  }

  if (request.action === 'GET_GAIA_ID') {
    try {
      const gaiaId = Identity.extractGaiaId()
      sendResponse({ gaiaId })
    } catch (e) {
      console.error('TubeZenify: Failed to get GAIA ID', e)
      sendResponse({ gaiaId: null })
    }
    return true
  }
})

// Setup MutationObserver to detect when the guide is loaded/changed
let debounceTimer
const syncChannels = () => {
  if (!chrome.runtime?.id) {
    return
  }
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    try {
      const [scrapedResult, fetchedChannels, pageContextChannels] =
        await Promise.all([
          Promise.resolve(scrapeChannels()),
          fetchChannelsFromFeed(),
          scrapeFromPageContext(),
        ])

      // Merge all sources using the unified helper
      let finalChannels = mergeChannels(fetchedChannels, scrapedResult.channels)
      finalChannels = mergeChannels(finalChannels, pageContextChannels)

      if (Object.keys(finalChannels).length > 0) {
        const gaiaId = Identity.extractGaiaId()
        const isLoggedIn = !!(
          gaiaId ||
          document.querySelector(
            'ytd-masthead #buttons ytd-button-renderer a[href*="ServiceLogin"]'
          ) === null
        )

        chrome.runtime
          .sendMessage({
            action: 'CHANNELS_UPDATED',
            channels: finalChannels,
            isLoggedIn,
            gaiaId,
          })
          .catch((_err) => {
            // Ignore if sidepanel is closed
          })
      }
    } catch (e) {
      console.error('TubeZenify: syncChannels failed', e)
    }
  }, 2000)
}

const observer = new MutationObserver((_mutations) => {
  syncChannels()
})

function startObserving() {
  const guide = document.querySelector('ytd-guide-renderer')
  const miniGuide = document.querySelector('ytd-mini-guide-renderer')
  let started = false

  if (guide) {
    observer.observe(guide, { childList: true, subtree: true })
    started = true
  }
  if (miniGuide) {
    observer.observe(miniGuide, { childList: true, subtree: true })
    started = true
  }
  return started
}

const bodyObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      for (const node of mutation.addedNodes) {
        if (
          node.nodeType === 1 &&
          (node.tagName === 'YTD-GUIDE-RENDERER' ||
            node.tagName === 'YTD-MINI-GUIDE-RENDERER' ||
            node.querySelector?.('ytd-guide-renderer, ytd-mini-guide-renderer'))
        ) {
          startObserving()
          syncChannels()
        }
      }
    }
  }
})

bodyObserver.observe(document.body, { childList: true, subtree: true })

window.addEventListener('yt-navigate-finish', () => {
  syncChannels()
})

startObserving()
syncChannels()
