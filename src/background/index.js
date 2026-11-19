import {
  findChannelsAndContinuation,
  fetchSidebarGuide,
  fetchPlaylistsPipeline,
  buildYouTubeAuthHeaders,
  buildSanitizedContext,
  parseYtInitialData,
} from './library.js'

function safeSendRuntimeMessage(payload) {
  try {
    const maybePromise = chrome.runtime.sendMessage(payload)
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {
        // Side panel may be closed when async background fetch completes
      })
    }
  } catch (_e) {
    // Ignore runtime unavailable errors
  }
}

// Fetches ALL subscribed channels by following continuation tokens
// Called from background to bypass CSP
async function fetchChannelsFromFeed(
  apiKey,
  context,
  clientVersion,
  sapisid,
  accountMeta = {}
) {
  const allChannels = {}
  let continuationToken = null

  try {
    const authHeaders = await buildYouTubeAuthHeaders(sapisid, accountMeta)
    const sanitizedContext = context ? buildSanitizedContext(context) : context

    // Step 1: Initial Page Load (respect multi-account sessionIndex)
    const sessionIndex = accountMeta?.sessionIndex
    const feedUrl =
      sessionIndex !== undefined &&
      sessionIndex !== null &&
      String(sessionIndex) !== '' &&
      String(sessionIndex) !== '0'
        ? `https://www.youtube.com/feed/channels?authuser=${encodeURIComponent(String(sessionIndex))}`
        : 'https://www.youtube.com/feed/channels'
    const response = await fetch(feedUrl, {
      credentials: 'include',
    })
    const text = await response.text()
    const data = parseYtInitialData(text)

    if (data) {
      const result = findChannelsAndContinuation(data)
      Object.assign(allChannels, result.channels)
      continuationToken = result.continuation
    }

    // Step 2: Follow Continuations (Pagination)
    let pageCount = 1
    const maxPages = 20

    while (continuationToken && pageCount < maxPages && apiKey) {
      pageCount++
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Youtube-Client-Name': '1',
            'X-Youtube-Client-Version': clientVersion || '2.20240315.01.00',
            ...authHeaders,
          },
          body: JSON.stringify({
            context: sanitizedContext,
            continuation: continuationToken,
          }),
          credentials: 'include',
        }
      )

      if (!res.ok) break
      const batchData = await res.json()
      const result = findChannelsAndContinuation(batchData)
      Object.assign(allChannels, result.channels)
      continuationToken = result.continuation
    }

    // Step 3: Augment with Guide Data (for accurate Status) regardless of feed failure
    if (apiKey) {
      try {
        const guideChannels = await fetchSidebarGuide(
          apiKey,
          context,
          clientVersion,
          sapisid,
          accountMeta
        )

        Object.values(guideChannels).forEach((gChannel) => {
          if (allChannels[gChannel.id]) {
            // Existing channel: Update status only
            allChannels[gChannel.id].isLive =
              allChannels[gChannel.id].isLive || gChannel.isLive
            allChannels[gChannel.id].hasNewContent =
              allChannels[gChannel.id].hasNewContent || gChannel.hasNewContent
          } else {
            // It's in Guide but not in Feed.
            // Filter by checking if it has a valid-looking icon.
            const hasValidIcon =
              gChannel.icon &&
              !gChannel.icon.includes('/default_profile_picture_') &&
              gChannel.icon.startsWith('https://')

            if (hasValidIcon) {
              allChannels[gChannel.id] = gChannel
            }
          }
        })
      } catch (e) {
        console.warn(
          'TubeZenify: Guide fetch failed, continuing with feed data',
          e
        )
      }
    }
    return allChannels
  } catch (e) {
    console.error('TubeZenify: Error during background fetch:', e)
    throw e // Throw so the caller knows it failed
  }
}

// Fetches user's saved/created playlists from /feed/playlists and guide API
async function fetchPlaylistsFromFeed(
  apiKey,
  context,
  clientVersion,
  sapisid,
  accountMeta = {}
) {
  return fetchPlaylistsPipeline({
    apiKey,
    context,
    clientVersion,
    sapisid,
    sessionIndex: accountMeta?.sessionIndex,
    delegatedSessionId: accountMeta?.delegatedSessionId,
    visitorData: accountMeta?.visitorData,
    sourceLabel: 'background',
  })
}

// Allow opening side panel by clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

// Handle fetch requests from content script and sidepanel orchestration
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'FETCH_CHANNELS_BACKEND') {
    fetchChannelsFromFeed(
      request.apiKey,
      request.context,
      request.clientVersion,
      request.sapisid,
      {
        sessionIndex: request.sessionIndex,
        delegatedSessionId: request.delegatedSessionId,
        visitorData: request.visitorData,
      }
    )
      .then((channels) => {
        sendResponse({ channels })
      })
      .catch((error) => {
        sendResponse({ error: error.message || 'Failed to fetch' })
      })
    return true
  }

  if (request.action === 'FETCH_PLAYLISTS_BACKEND') {
    fetchPlaylistsFromFeed(
      request.apiKey,
      request.context,
      request.clientVersion,
      request.sapisid,
      {
        sessionIndex: request.sessionIndex,
        delegatedSessionId: request.delegatedSessionId,
        visitorData: request.visitorData,
      }
    )
      .then((playlists) => {
        sendResponse({ playlists })
      })
      .catch((error) => {
        sendResponse({ error: error.message || 'Failed to fetch playlists' })
      })
    return true
  }

  if (
    request.action === 'START_SCRAPE' ||
    request.action === 'CLEAR_AND_SCRAPE'
  ) {
    safeSendRuntimeMessage({ action: 'SET_CONNECTING' })

    // 1. Proactive Background Fetch (using cached credentials)
    chrome.storage.local.get(['yt_credentials'], (result) => {
      const creds = result.yt_credentials
      if (creds && creds.apiKey && creds.context) {
        const accountMeta = {
          sessionIndex: creds.sessionIndex,
          delegatedSessionId: creds.delegatedSessionId,
          visitorData: creds.visitorData,
        }
        // Use the CACHED context which is known to be "clean" (from Home/Browse)
        fetchChannelsFromFeed(
          creds.apiKey,
          creds.context,
          creds.clientVersion,
          creds.sapisid,
          accountMeta
        )
          .then((channels) => {
            if (Object.keys(channels).length > 0) {
              // Get login status from cached info (rough estimate)
              safeSendRuntimeMessage({
                action: 'CHANNELS_UPDATED',
                channels: channels,
                isLoggedIn: true, // We have creds, so likely logged in
                source: 'internal_cache',
              })
            }
          })
          .catch((e) => {
            console.error('TubeZenify: Background fetch failed', e)
            safeSendRuntimeMessage({
              action: 'CONNECTION_ERROR',
              error: e.message || 'Background fetch failed',
              isLoginRequired: false,
            })
          })

        fetchPlaylistsFromFeed(
          creds.apiKey,
          creds.context,
          creds.clientVersion,
          creds.sapisid,
          accountMeta
        )
          .then((playlists) => {
            if (Object.keys(playlists).length > 0) {
              safeSendRuntimeMessage({
                action: 'PLAYLISTS_UPDATED',
                playlists,
                source: 'internal_cache',
              })
            }
          })
          .catch((e) => {
            console.warn('TubeZenify: Background playlist fetch failed', e)
          })
      }
    })

    // 2. Tab-based Scrape/Fetch (prefer active/non-watch tab; never force-reload user tabs)
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        const orderedTabs = [...tabs].sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1
          const aWatch = a.url?.includes('/watch') ? 1 : 0
          const bWatch = b.url?.includes('/watch') ? 1 : 0
          return aWatch - bWatch
        })

        const tryTab = (index) => {
          if (index >= orderedTabs.length) {
            // All open YouTube tabs failed to respond (e.g. content script orphaned after extension reload).
            // Reload only a single non-watch tab (or the first tab) so the content script can re-inject.
            const reloadCandidate =
              orderedTabs.find((t) => !t.url?.includes('/watch')) ||
              orderedTabs[0]
            if (reloadCandidate?.id) {
              chrome.tabs.reload(reloadCandidate.id)
            }
            return
          }
          const tab = orderedTabs[index]
          chrome.tabs.sendMessage(
            tab.id,
            { action: 'GET_CHANNELS' },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn('TubeZenify: Target tab not responding', tab.id)
                tryTab(index + 1)
                return
              }
              if (
                response &&
                response.channels &&
                Object.keys(response.channels).length > 0
              ) {
                safeSendRuntimeMessage({
                  action: 'CHANNELS_UPDATED',
                  channels: response.channels,
                  isLoggedIn: response.isLoggedIn,
                  gaiaId: response.gaiaId,
                  source: 'tab',
                })
              }
              if (
                response &&
                response.playlists &&
                Object.keys(response.playlists).length > 0
              ) {
                safeSendRuntimeMessage({
                  action: 'PLAYLISTS_UPDATED',
                  playlists: response.playlists,
                  gaiaId: response.gaiaId,
                  source: 'tab',
                })
              }
            }
          )
        }

        tryTab(0)
      } else {
        // No YouTube tab found. Open it so we can fetch channels.
        chrome.tabs.create({
          url: 'https://www.youtube.com/feed/subscriptions',
        })
      }
    })
    return false
  }
})
