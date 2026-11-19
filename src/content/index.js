import { Identity, extractBalancedJsonObject } from '../utils/identity.js'
import { SYSTEM_PLAYLIST_IDS } from '../utils/constants.js'
import { fetchPlaylistsPipeline } from '../background/library.js'

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

// Helper to extract playlist data from the DOM (fallback for visible items)
export function scrapePlaylists() {
  const playlists = {}
  const pathname = window.location?.pathname || '/'
  const isPlaylistsFeedPage =
    pathname.startsWith('/feed/playlists') ||
    pathname.startsWith('/feed/library')

  const items = document.querySelectorAll(
    'ytd-guide-entry-renderer, ytd-grid-playlist-renderer, ytd-playlist-renderer, yt-lockup-view-model'
  )

  items.forEach((item) => {
    const anchor =
      item.querySelector('a[href*="/playlist?list="]') ||
      item.querySelector('a[href*="list="]') ||
      item.querySelector('a')
    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href) return

    const isPlaylistUrl = href.includes('/playlist')
    const isFeedWatchPlaylist = isPlaylistsFeedPage && href.includes('list=')
    if (!isPlaylistUrl && !isFeedWatchPlaylist) return

    let listId = null
    try {
      const urlObj = new URL(href, 'https://www.youtube.com')
      listId = urlObj.searchParams.get('list')
    } catch (_e) {
      return
    }

    if (!listId || SYSTEM_PLAYLIST_IDS.has(listId)) return

    const titleEl =
      item.querySelector('.title') ||
      item.querySelector('#video-title') ||
      item.querySelector('.yt-lockup-metadata-view-model__title') ||
      item.querySelector('h3') ||
      anchor
    const name = titleEl?.textContent?.trim()
    if (!name) return

    const img = item.querySelector('img')
    const iconSrc = img?.src
    const icon = iconSrc && iconSrc.startsWith('https://') ? iconSrc : ''

    playlists[listId] = {
      id: listId,
      name,
      icon,
      url: `https://www.youtube.com/playlist?list=${listId}`,
    }
  })

  return { playlists }
}

function extractSapisid() {
  try {
    const cookies = document.cookie ? document.cookie.split(';') : []
    let secure3p = ''
    for (const part of cookies) {
      const [rawKey, ...rest] = part.trim().split('=')
      if (rawKey === 'SAPISID') {
        return decodeURIComponent(rest.join('='))
      }
      if (rawKey === '__Secure-3PAPISID' && !secure3p) {
        secure3p = decodeURIComponent(rest.join('='))
      }
    }
    return secure3p
  } catch (_e) {
    return ''
  }
}

/**
 * Extracts YouTube internal configuration for API calls from <script> tags
 */
function extractYouTubeConfig() {
  const scripts = document.querySelectorAll('script')
  let apiKey = ''
  let context = {}
  let clientVersion = ''

  for (const script of scripts) {
    const text = script.textContent
    if (!text) continue

    if (!apiKey && text.includes('INNERTUBE_API_KEY')) {
      const apiMatch = text.match(/"INNERTUBE_API_KEY":"([^"]+)"/)
      if (apiMatch) apiKey = apiMatch[1]
    }

    if (!clientVersion && text.includes('INNERTUBE_CLIENT_VERSION')) {
      const versionMatch = text.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)
      if (versionMatch) clientVersion = versionMatch[1]
    }

    if (
      Object.keys(context).length === 0 &&
      text.includes('INNERTUBE_CONTEXT')
    ) {
      const startKey = '"INNERTUBE_CONTEXT":'
      const startIdx = text.indexOf(startKey)
      if (startIdx !== -1) {
        const afterKey = text.substring(startIdx + startKey.length).trim()
        const parsed = extractBalancedJsonObject(afterKey)
        if (parsed) context = parsed
      }
    }

    if (apiKey && clientVersion && Object.keys(context).length > 0) break
  }

  const sapisid = extractSapisid()
  return { apiKey, context, clientVersion, sapisid }
}

async function resolveYoutubeCredentials() {
  const ytcfg = await requestFromPageContext(
    'TUBE_ZENIFY_REQUEST_YTCFG',
    'TUBE_ZENIFY_RESPONSE_YTCFG',
    {},
    350
  )

  const hasYtcfg =
    Boolean(ytcfg?.apiKey) &&
    Boolean(ytcfg?.context && Object.keys(ytcfg.context).length > 0)
  const domConfig = hasYtcfg
    ? {
        apiKey: '',
        context: {},
        clientVersion: '',
        sapisid: extractSapisid(),
      }
    : extractYouTubeConfig()

  let apiKey = ytcfg?.apiKey || domConfig.apiKey
  let context =
    ytcfg?.context && Object.keys(ytcfg.context).length > 0
      ? ytcfg.context
      : domConfig.context
  let clientVersion = ytcfg?.clientVersion || domConfig.clientVersion
  let sapisid = domConfig.sapisid
  let sessionIndex = ytcfg?.sessionIndex
  let delegatedSessionId = ytcfg?.delegatedSessionId || ''
  let visitorData = ytcfg?.visitorData || ''

  const isWatchPage = window.location.pathname.startsWith('/watch')
  if (apiKey && Object.keys(context).length > 0 && !isWatchPage) {
    chrome.storage.local.set({
      yt_credentials: {
        apiKey,
        context,
        clientVersion,
        sapisid,
        sessionIndex,
        delegatedSessionId,
        visitorData,
        timestamp: Date.now(),
      },
    })
  }

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
        sapisid = sapisid || cached.yt_credentials.sapisid || ''
        if (sessionIndex === undefined) {
          sessionIndex = cached.yt_credentials.sessionIndex
        }
        delegatedSessionId =
          delegatedSessionId || cached.yt_credentials.delegatedSessionId || ''
        visitorData = visitorData || cached.yt_credentials.visitorData || ''
      }
    } catch (_e) {
      // Ignore fallback error
    }
  }

  return {
    apiKey,
    context,
    clientVersion,
    sapisid,
    sessionIndex,
    delegatedSessionId,
    visitorData,
  }
}

/**
 * Delegates fetching to background script to bypass CSP
 */
export async function fetchChannelsFromFeed(preResolvedCreds) {
  const {
    apiKey,
    context,
    clientVersion,
    sapisid,
    sessionIndex,
    delegatedSessionId,
    visitorData,
  } = preResolvedCreds || (await resolveYoutubeCredentials())

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
      sapisid,
      sessionIndex,
      delegatedSessionId,
      visitorData,
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

/**
 * Fetches playlists directly from the same-origin YouTube tab first,
 * falling back to the background service worker if needed.
 */
export async function fetchPlaylistsFromFeed(preResolvedCreds) {
  const {
    apiKey,
    context,
    clientVersion,
    sapisid,
    sessionIndex,
    delegatedSessionId,
    visitorData,
  } = preResolvedCreds || (await resolveYoutubeCredentials())

  try {
    const directPlaylists = await fetchPlaylistsPipeline({
      apiKey,
      context,
      clientVersion,
      sapisid,
      sessionIndex,
      delegatedSessionId,
      visitorData,
      sourceLabel: 'content',
    })
    if (Object.keys(directPlaylists).length > 0) {
      return directPlaylists
    }
  } catch (e) {
    console.warn('TubeZenify: Direct playlist fetch failed', e)
  }

  if (!apiKey) {
    return {}
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'FETCH_PLAYLISTS_BACKEND',
      apiKey,
      context,
      clientVersion,
      sapisid,
      sessionIndex,
      delegatedSessionId,
      visitorData,
    })

    if (response && response.playlists) {
      return response.playlists
    }
  } catch (e) {
    console.warn('TubeZenify: Background playlist fetch failed', e)
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

// Helper to merge playlists from multiple sources
export function mergePlaylists(fetched, scraped) {
  const merged = { ...fetched }
  if (!scraped) return merged

  const scrapedList = Array.isArray(scraped) ? scraped : Object.values(scraped)
  scrapedList.forEach((item) => {
    if (!item?.id || SYSTEM_PLAYLIST_IDS.has(item.id)) return
    if (merged[item.id]) {
      merged[item.id] = {
        ...merged[item.id],
        name: item.name || merged[item.id].name,
        icon: merged[item.id].icon || item.icon || '',
        videoCount: merged[item.id].videoCount || item.videoCount || '',
      }
    } else {
      merged[item.id] = {
        ...item,
        url: item.url || `https://www.youtube.com/playlist?list=${item.id}`,
      }
    }
  })

  return merged
}

function requestFromPageContext(
  requestEventName,
  responseEventName,
  fallback = [],
  timeoutMs = 2000
) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      window.removeEventListener(responseEventName, handler)
      resolve(fallback)
    }, timeoutMs)

    const handler = (event) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener(responseEventName, handler)
      try {
        resolve(event.detail ?? fallback)
      } catch (_e) {
        resolve(fallback)
      }
    }
    window.addEventListener(responseEventName, handler)

    window.dispatchEvent(new CustomEvent(requestEventName))
  })
}

async function gatherAllLibraryData() {
  const creds = await resolveYoutubeCredentials()
  const [
    scrapedChannelsResult,
    fetchedChannels,
    pageContextChannels,
    scrapedPlaylistsResult,
    fetchedPlaylists,
    pageContextPlaylists,
  ] = await Promise.all([
    Promise.resolve(scrapeChannels()),
    fetchChannelsFromFeed(creds),
    requestFromPageContext(
      'TUBE_ZENIFY_REQUEST_GUIDE_DATA',
      'TUBE_ZENIFY_RESPONSE_GUIDE_DATA'
    ),
    Promise.resolve(scrapePlaylists()),
    fetchPlaylistsFromFeed(creds).catch(() => ({})),
    requestFromPageContext(
      'TUBE_ZENIFY_REQUEST_PLAYLISTS_DATA',
      'TUBE_ZENIFY_RESPONSE_PLAYLISTS_DATA'
    ),
  ])

  let finalChannels = mergeChannels(
    fetchedChannels,
    scrapedChannelsResult.channels
  )
  finalChannels = mergeChannels(finalChannels, pageContextChannels)

  let finalPlaylists = mergePlaylists(
    fetchedPlaylists,
    scrapedPlaylistsResult.playlists
  )
  finalPlaylists = mergePlaylists(finalPlaylists, pageContextPlaylists)

  const gaiaId = Identity.extractGaiaId()
  const isLoggedIn = !!(
    gaiaId ||
    document.querySelector(
      'ytd-masthead #buttons ytd-button-renderer a[href*="ServiceLogin"]'
    ) === null
  )

  return {
    channels: finalChannels,
    playlists: finalPlaylists,
    isLoggedIn,
    gaiaId,
  }
}

// Listen for messages from Side Panel
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_CHANNELS') {
    ;(async () => {
      try {
        const result = await gatherAllLibraryData()
        sendResponse(result)
      } catch (e) {
        console.error('TubeZenify: GET_CHANNELS Error:', e)
        sendResponse({
          channels: {},
          playlists: {},
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
      const { channels, playlists, isLoggedIn, gaiaId } =
        await gatherAllLibraryData()

      if (Object.keys(channels).length > 0) {
        chrome.runtime
          .sendMessage({
            action: 'CHANNELS_UPDATED',
            channels,
            isLoggedIn,
            gaiaId,
          })
          .catch(() => {
            // Ignore if sidepanel is closed
          })
      }

      if (Object.keys(playlists).length > 0) {
        chrome.runtime
          .sendMessage({
            action: 'PLAYLISTS_UPDATED',
            playlists,
            gaiaId,
          })
          .catch(() => {
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
          if (startObserving()) {
            bodyObserver.disconnect()
          }
          syncChannels()
          return
        }
      }
    }
  }
})

if (!startObserving() && document.body) {
  bodyObserver.observe(document.body, { childList: true, subtree: true })
}

window.addEventListener('yt-navigate-finish', () => {
  syncChannels()
})

startObserving()
syncChannels()
