import { findChannelsAndContinuation, fetchSidebarGuide } from './library.js'

// Fetches ALL subscribed channels by following continuation tokens
// Called from background to bypass CSP
async function fetchChannelsFromFeed(apiKey, context, clientVersion) {
  const allChannels = {}
  let continuationToken = null

  try {
    // Step 1: Initial Page Load
    const response = await fetch('https://www.youtube.com/feed/channels')
    const text = await response.text()
    let data = null
    const jsonMatch =
      text.match(/var ytInitialData\s*=\s*({.*?});/) ||
      text.match(/window\["ytInitialData"\]\s*=\s*({.*?});/)

    if (jsonMatch) {
      try {
        data = JSON.parse(jsonMatch[1])
      } catch (e) {
        console.error('Failed to parse ytInitialData', e)
      }
    }

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: context,
            continuation: continuationToken,
          }),
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
          clientVersion
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
      request.clientVersion
    )
      .then((channels) => {
        sendResponse({ channels })
      })
      .catch((error) => {
        sendResponse({ error: error.message || 'Failed to fetch' })
      })
    return true
  }

  if (
    request.action === 'START_SCRAPE' ||
    request.action === 'CLEAR_AND_SCRAPE'
  ) {
    chrome.runtime.sendMessage({ action: 'SET_CONNECTING' })

    // 1. Proactive Background Fetch (using cached credentials)
    chrome.storage.local.get(['yt_credentials'], (result) => {
      const creds = result.yt_credentials
      if (creds && creds.apiKey && creds.context) {
        // Use the CACHED context which is known to be "clean" (from Home/Browse)
        fetchChannelsFromFeed(creds.apiKey, creds.context, creds.clientVersion)
          .then((channels) => {
            if (Object.keys(channels).length > 0) {
              // Get login status from cached info (rough estimate)
              chrome.runtime.sendMessage({
                action: 'CHANNELS_UPDATED',
                channels: channels,
                isLoggedIn: true, // We have creds, so likely logged in
                source: 'internal_cache',
              })
            }
          })
          .catch((e) => {
            console.error('TubeZenify: Background fetch failed', e)
            chrome.runtime.sendMessage({
              action: 'CONNECTION_ERROR',
              error: e.message || 'Background fetch failed',
              isLoginRequired: false,
            })
          })
      }
    })

    // 2. Tab-based Scrape/Fetch (most accurate for DOM data)
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(
            tab.id,
            { action: 'GET_CHANNELS' },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn('TubeZenify: Target tab not responding', tab.id)
                // If content script is dead (e.g. extension reloaded), reload the tab
                chrome.tabs.reload(tab.id)
                return
              }
              if (
                response &&
                response.channels &&
                Object.keys(response.channels).length > 0
              ) {
                chrome.runtime.sendMessage({
                  action: 'CHANNELS_UPDATED',
                  channels: response.channels,
                  isLoggedIn: response.isLoggedIn,
                  gaiaId: response.gaiaId,
                })
              }
            }
          )
        })
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
