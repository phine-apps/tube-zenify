/**
 * Helper to traverse and find channel items and continuation tokens
 * Moved from background/index.js for testing
 */
export const findChannelsAndContinuation = (
  obj,
  results = { channels: {}, continuation: null }
) => {
  if (!obj || typeof obj !== 'object') return results

  // 1. Look for Channels
  const item =
    obj.gridChannelRenderer || obj.channelRenderer || obj.guideEntryRenderer
  if (item) {
    let id = item.channelId
    if (!id && item.navigationEndpoint?.browseEndpoint?.browseId) {
      id = item.navigationEndpoint.browseEndpoint.browseId
    }

    let title = item.title?.simpleText || item.title?.runs?.[0]?.text
    if (!title && item.formattedTitle) {
      title =
        item.formattedTitle.simpleText || item.formattedTitle.runs?.[0]?.text
    }

    let icon = null
    if (item.thumbnail?.thumbnails?.length > 0) {
      let url =
        item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1].url
      if (url && url.startsWith('//')) url = 'https:' + url
      icon = url
    }

    // --- Improved Status Detection ---
    let isLive = false

    // 1. Check liveBroadcasting boolean (common in Guide API)
    if (item.badges?.liveBroadcasting === true) {
      isLive = true
    }

    // 2. Check badges array / renderer
    if (!isLive) {
      const badges = item.badges || item.metadataBadgeRenderer
      if (badges) {
        const badgeArray = Array.isArray(badges) ? badges : [badges]
        isLive = badgeArray.some((b) => {
          const renderer = b.metadataBadgeRenderer || b
          if (!renderer) return false
          const style = renderer.style || ''

          return style === 'BADGE_STYLE_TYPE_LIVE_NOW'
        })
      }
    }

    // 3. New Content (Blue Dot) Detection
    let hasNewContent = false
    const labelMain = item.accessibility?.label || ''
    const labelData = item.accessibility?.accessibilityData?.label || ''
    const fullLabel = (labelMain + ' ' + labelData).toLowerCase()

    if (
      item.presentationConfig?.guideEntryPresentationConfig?.isNewContent ||
      item.presentationStyle === 'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT' ||
      fullLabel.includes('new content') ||
      fullLabel.includes('新しいコンテンツ') ||
      fullLabel.includes('有新内容')
    ) {
      hasNewContent = true
    }

    // --- End Detection ---

    if (id && title) {
      // Filter out system channels (Topics, Feeds) which usually have IDs like 'FE...', 'VL...'
      // Valid User Channels always start with 'UC'
      if (id.startsWith('UC')) {
        results.channels[id] = {
          id,
          name: title,
          icon:
            icon ||
            'https://www.gstatic.com/youtube/img/channels/default_profile_picture_default.png',
          url: `https://www.youtube.com/channel/${id}`,
          isLive: isLive,
          hasNewContent: hasNewContent,
        }
      }
    }
  }

  // 2. Look for Continuation Token
  if (obj.continuationItemRenderer) {
    const token =
      obj.continuationItemRenderer.continuationEndpoint?.continuationCommand
        ?.token
    if (token) results.continuation = token
  }

  // Recursive search
  Object.values(obj).forEach((val) => {
    if (Array.isArray(val)) {
      val.forEach((v) => findChannelsAndContinuation(v, results))
    } else if (typeof val === 'object') {
      findChannelsAndContinuation(val, results)
    }
  })

  return results
}

/**
 * Fetches the specific Sidebar Guide to get accurate Live/New status
 * including for collapsed items
 */
export async function fetchSidebarGuide(apiKey, context, clientVersion) {
  try {
    // Sanitize context to key "BROWSE" mode behavior
    // This prevents Watch-page specific tracking params from breaking the global Guide request
    const sanitizedContext = { ...context }
    if (sanitizedContext.client) {
      sanitizedContext.client = { ...sanitizedContext.client }
      sanitizedContext.client.originalUrl = 'https://www.youtube.com/'

      // Remove Watch-specific web info which might confuse the Guide API
      delete sanitizedContext.client.mainAppWebInfo
      delete sanitizedContext.client.configInfo
    }
    delete sanitizedContext.clickTracking
    delete sanitizedContext.adSignalsInfo

    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/guide?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Youtube-Client-Name': '1',
          'X-Youtube-Client-Version': clientVersion || '2.20240315.01.00',
        },
        body: JSON.stringify({ context: sanitizedContext }),
        credentials: 'include',
      }
    )

    if (!res.ok) return {}
    const data = await res.json()
    const results = findChannelsAndContinuation(data)
    return results.channels
  } catch (e) {
    console.error('Failed to fetch guide', e)
    return {}
  }
}
