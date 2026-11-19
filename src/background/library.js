import { SYSTEM_PLAYLIST_IDS } from '../utils/constants.js'

const extractText = (field) => {
  if (!field) return ''
  if (typeof field === 'string') return field
  if (field.simpleText) return field.simpleText
  if (Array.isArray(field.runs)) {
    return field.runs.map((r) => r.text || '').join('')
  }
  if (field.content) return field.content
  return ''
}

const normalizeHttpsUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  if (url.startsWith('//')) return `https:${url}`
  return url.startsWith('https://') ? url : ''
}

const extractThumbnailUrl = (thumbnailObj) => {
  const thumbs = thumbnailObj?.thumbnails || thumbnailObj?.sources
  if (!Array.isArray(thumbs) || thumbs.length === 0) return ''
  const candidate = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url
  return normalizeHttpsUrl(candidate)
}

const extractContinuationToken = (obj) =>
  obj?.continuationItemRenderer?.continuationEndpoint?.continuationCommand
    ?.token ||
  obj?.continuationItemRenderer?.continuationEndpoint?.commandExecutorCommand
    ?.commands?.[0]?.continuationCommand?.token ||
  null

function extractListIdFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  try {
    const parsed = new URL(rawUrl, 'https://www.youtube.com')
    return parsed.searchParams.get('list') || ''
  } catch (_e) {
    return ''
  }
}

/**
 * Parses ytInitialData JSON from YouTube HTML using string-aware brace matching.
 * Avoids regex truncation when JSON strings contain "};" or newlines.
 * @param {string} html
 * @returns {object|null}
 */
export function parseYtInitialData(html) {
  if (!html || typeof html !== 'string') return null

  const markers = [
    /var\s+ytInitialData\s*=/g,
    /window\["ytInitialData"\]\s*=/g,
    /window\.ytInitialData\s*=/g,
  ]

  for (const marker of markers) {
    let match
    while ((match = marker.exec(html)) !== null) {
      let startIdx = match.index + match[0].length
      while (startIdx < html.length && /\s/.test(html[startIdx])) {
        startIdx++
      }
      if (html[startIdx] !== '{') continue

      let depth = 0
      let inString = false
      let isEscaped = false

      for (let i = startIdx; i < html.length; i++) {
        const ch = html[i]

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
              return JSON.parse(html.slice(startIdx, i + 1))
            } catch (e) {
              console.warn('Failed to parse ytInitialData candidate', e)
              break
            }
          }
        }
      }
    }
  }

  return null
}

/**
 * Normalizes a YouTube playlist ID or VL-prefixed browseId.
 * Returns null for system lists (WL, LL, etc.) or non-playlist IDs.
 * @param {string} rawId
 * @returns {string|null}
 */
export const normalizePlaylistId = (rawId) => {
  if (!rawId || typeof rawId !== 'string') return null
  const id = rawId.startsWith('VL') ? rawId.slice(2) : rawId
  if (!id || SYSTEM_PLAYLIST_IDS.has(id)) return null
  if (id.startsWith('FE') || id.startsWith('UC') || id.startsWith('SP')) {
    return null
  }
  return id
}

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
    const token = extractContinuationToken(obj)
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

function extractLockupVideoCount(lockup, primaryThumb) {
  const overlayText =
    primaryThumb?.overlays?.[0]?.thumbnailOverlayBadgeViewModel
      ?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel?.text || ''
  if (overlayText) return overlayText

  const rows =
    lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows ||
    lockup.metadata?.lockupMetadataViewModel?.metadata?.contentRows ||
    []

  for (const row of rows) {
    for (const part of row?.metadataParts || []) {
      const txt = extractText(part?.text)
      if (txt && /(\d|video|本)/i.test(txt)) {
        return txt
      }
    }
  }
  return ''
}

function collectLockupCommands(lockup) {
  const commands = []
  const onTap = lockup.rendererContext?.commandContext?.onTap
  if (onTap?.innertubeCommand) commands.push(onTap.innertubeCommand)
  if (Array.isArray(onTap?.serialCommand?.commands)) {
    for (const c of onTap.serialCommand.commands) {
      if (c?.innertubeCommand) commands.push(c.innertubeCommand)
      else if (c) commands.push(c)
    }
  }

  const rows =
    lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows ||
    lockup.metadata?.lockupMetadataViewModel?.metadata?.contentRows ||
    []
  for (const row of rows) {
    for (const part of row?.metadataParts || []) {
      for (const run of part?.text?.commandRuns || []) {
        if (run?.onTap?.innertubeCommand) {
          commands.push(run.onTap.innertubeCommand)
        }
      }
    }
  }
  return commands
}

function extractPlaylistFromObject(obj) {
  // 1. Classic playlist renderers (/feed/playlists or search/browse)
  const classic =
    obj.gridPlaylistRenderer ||
    obj.playlistRenderer ||
    obj.compactPlaylistRenderer
  if (classic) {
    const rawId =
      classic.playlistId ||
      classic.navigationEndpoint?.watchEndpoint?.playlistId ||
      classic.navigationEndpoint?.browseEndpoint?.browseId ||
      extractListIdFromUrl(
        classic.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url
      )
    const id = normalizePlaylistId(rawId)
    const name = extractText(classic.title)
    if (!id || !name) return null
    const icon =
      extractThumbnailUrl(classic.thumbnail) ||
      extractThumbnailUrl(classic.thumbnails?.[0])
    const videoCount =
      extractText(classic.videoCountText) ||
      (classic.videoCount != null ? String(classic.videoCount) : '')

    return {
      id,
      name,
      icon,
      videoCount,
      url: `https://www.youtube.com/playlist?list=${id}`,
    }
  }

  // 2. Modern lockupViewModel (YouTube 2024+ /feed/playlists UI)
  if (obj.lockupViewModel) {
    const lockup = obj.lockupViewModel
    const commands = collectLockupCommands(lockup)

    let tapBrowseId = ''
    let tapWatchPlaylistId = ''
    let urlListId = ''
    let hasListUrl = false

    for (const cmd of commands) {
      const bId = cmd?.browseEndpoint?.browseId || ''
      if (!tapBrowseId && bId.startsWith('VL')) tapBrowseId = bId
      const wId = cmd?.watchEndpoint?.playlistId || ''
      if (!tapWatchPlaylistId && wId) tapWatchPlaylistId = wId
      const cmdUrl = cmd?.commandMetadata?.webCommandMetadata?.url || ''
      if (cmdUrl.includes('list=')) {
        hasListUrl = true
        if (!urlListId) urlListId = extractListIdFromUrl(cmdUrl)
      }
    }

    const isPlaylistType =
      lockup.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' ||
      tapBrowseId.startsWith('VL') ||
      Boolean(tapWatchPlaylistId) ||
      hasListUrl

    if (isPlaylistType) {
      const id =
        normalizePlaylistId(lockup.contentId) ||
        normalizePlaylistId(tapWatchPlaylistId) ||
        normalizePlaylistId(tapBrowseId) ||
        normalizePlaylistId(urlListId)
      const name = extractText(lockup.metadata?.lockupMetadataViewModel?.title)
      if (!id || !name) return null

      const primaryThumb =
        lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail
          ?.thumbnailViewModel || lockup.contentImage?.thumbnailViewModel
      const icon = extractThumbnailUrl(primaryThumb?.image)
      const videoCount = extractLockupVideoCount(lockup, primaryThumb)

      return {
        id,
        name,
        icon,
        videoCount,
        url: `https://www.youtube.com/playlist?list=${id}`,
      }
    }
  }

  // 3. Guide entry renderer (Sidebar playlists have VL-prefixed browseId or /playlist?list= URL)
  if (obj.guideEntryRenderer) {
    const entry = obj.guideEntryRenderer
    const browseId = entry.navigationEndpoint?.browseEndpoint?.browseId || ''
    const navUrl =
      entry.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || ''
    const urlListId = navUrl.includes('/playlist')
      ? extractListIdFromUrl(navUrl)
      : ''

    if (!browseId.startsWith('VL') && !urlListId) return null

    const id = normalizePlaylistId(
      browseId.startsWith('VL') ? browseId : urlListId
    )
    const name = extractText(entry.formattedTitle) || extractText(entry.title)
    if (!id || !name) return null

    const icon = extractThumbnailUrl(entry.thumbnail)
    return {
      id,
      name,
      icon,
      videoCount: '',
      url: `https://www.youtube.com/playlist?list=${id}`,
    }
  }

  return null
}

/**
 * Traverses YouTube data structures to find playlists and continuation tokens.
 */
export const findPlaylistsAndContinuation = (
  obj,
  results = { playlists: {}, continuation: null }
) => {
  if (!obj || typeof obj !== 'object') return results

  const extracted = extractPlaylistFromObject(obj)
  if (extracted) {
    const existing = results.playlists[extracted.id]
    results.playlists[extracted.id] = {
      ...extracted,
      icon: extracted.icon || existing?.icon || '',
      videoCount: extracted.videoCount || existing?.videoCount || '',
    }
  }

  if (obj.continuationItemRenderer) {
    const token = extractContinuationToken(obj)
    if (token) results.continuation = token
  }

  Object.values(obj).forEach((val) => {
    if (Array.isArray(val)) {
      val.forEach((v) => findPlaylistsAndContinuation(v, results))
    } else if (typeof val === 'object') {
      findPlaylistsAndContinuation(val, results)
    }
  })

  return results
}

function buildSanitizedContext(context) {
  const sanitizedContext = { ...context }
  if (sanitizedContext.client) {
    sanitizedContext.client = { ...sanitizedContext.client }
    sanitizedContext.client.originalUrl = 'https://www.youtube.com/'
    delete sanitizedContext.client.mainAppWebInfo
    delete sanitizedContext.client.configInfo
  }
  delete sanitizedContext.clickTracking
  delete sanitizedContext.adSignalsInfo
  return sanitizedContext
}

/**
 * Computes YouTube SAPISIDHASH Authorization header and optional multi-account headers.
 * @param {string} [sapisid]
 * @param {{ sessionIndex?: string|number, delegatedSessionId?: string, visitorData?: string }} [accountMeta]
 * @returns {Promise<Record<string, string>>}
 */
export async function buildYouTubeAuthHeaders(sapisid, accountMeta = {}) {
  const headers = {}

  if (
    accountMeta?.sessionIndex !== undefined &&
    accountMeta?.sessionIndex !== null &&
    accountMeta?.sessionIndex !== ''
  ) {
    headers['X-Goog-AuthUser'] = String(accountMeta.sessionIndex)
  }
  if (accountMeta?.delegatedSessionId) {
    headers['X-Goog-PageId'] = String(accountMeta.delegatedSessionId)
  }
  if (accountMeta?.visitorData) {
    headers['X-Goog-Visitor-Id'] = String(accountMeta.visitorData)
  }

  if (!sapisid || typeof crypto === 'undefined' || !crypto.subtle) {
    return headers
  }

  try {
    const origin = 'https://www.youtube.com'
    const timestamp = Math.floor(Date.now() / 1000)
    const msgBuffer = new TextEncoder().encode(
      `${timestamp} ${sapisid} ${origin}`
    )
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    headers.Authorization = `SAPISIDHASH ${timestamp}_${hashHex}`
    headers['X-Origin'] = origin
    return headers
  } catch (_e) {
    return headers
  }
}

/**
 * Fetches raw Sidebar Guide JSON from YouTube InnerTube API.
 */
export async function fetchSidebarGuideRaw(
  apiKey,
  context,
  clientVersion,
  sapisid,
  accountMeta = {}
) {
  try {
    const sanitizedContext = buildSanitizedContext(context)
    const authHeaders = await buildYouTubeAuthHeaders(sapisid, accountMeta)
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/guide?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Youtube-Client-Name': '1',
          'X-Youtube-Client-Version': clientVersion || '2.20240315.01.00',
          ...authHeaders,
        },
        body: JSON.stringify({ context: sanitizedContext }),
        credentials: 'include',
      }
    )

    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.error('Failed to fetch guide', e)
    return null
  }
}

/**
 * Fetches the specific Sidebar Guide to get accurate Live/New status
 * including for collapsed items
 */
export async function fetchSidebarGuide(
  apiKey,
  context,
  clientVersion,
  sapisid,
  accountMeta = {}
) {
  const data = await fetchSidebarGuideRaw(
    apiKey,
    context,
    clientVersion,
    sapisid,
    accountMeta
  )
  if (!data) return {}
  return findChannelsAndContinuation(data).channels
}

/**
 * Fetches playlists from the Sidebar Guide API.
 */
export async function fetchSidebarGuidePlaylists(
  apiKey,
  context,
  clientVersion,
  sapisid,
  accountMeta = {}
) {
  const data = await fetchSidebarGuideRaw(
    apiKey,
    context,
    clientVersion,
    sapisid,
    accountMeta
  )
  if (!data) return {}
  return findPlaylistsAndContinuation(data).playlists
}

/**
 * Shared playlist fetch pipeline usable from both Content Script (same-origin)
 * and Background Service Worker.
 */
export async function fetchPlaylistsPipeline({
  apiKey,
  context,
  clientVersion,
  sapisid,
  sessionIndex,
  delegatedSessionId,
  visitorData,
  sourceLabel = 'background',
}) {
  const allPlaylists = {}
  let continuationToken = null
  const accountMeta = { sessionIndex, delegatedSessionId, visitorData }

  try {
    const authHeaders = await buildYouTubeAuthHeaders(sapisid, accountMeta)
    const browseHeaders = {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': clientVersion || '2.20240315.01.00',
      ...authHeaders,
    }
    const sanitizedContext = context ? buildSanitizedContext(context) : null

    // Step 1: Load /feed/playlists HTML
    const feedUrl =
      sessionIndex !== undefined &&
      sessionIndex !== null &&
      String(sessionIndex) !== '' &&
      String(sessionIndex) !== '0'
        ? `https://www.youtube.com/feed/playlists?authuser=${encodeURIComponent(String(sessionIndex))}`
        : 'https://www.youtube.com/feed/playlists'
    const response = await fetch(feedUrl, { credentials: 'include' })
    const text = await response.text()
    const data = parseYtInitialData(text)

    if (data) {
      const result = findPlaylistsAndContinuation(data)
      Object.assign(allPlaylists, result.playlists)
      continuationToken = result.continuation
    }

    // Step 2: Query FEplaylist_aggregation / FElibrary via InnerTube if initial HTML yielded nothing
    if (Object.keys(allPlaylists).length === 0 && apiKey && sanitizedContext) {
      for (const browseId of ['FEplaylist_aggregation', 'FElibrary']) {
        try {
          const res = await fetch(
            `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`,
            {
              method: 'POST',
              headers: browseHeaders,
              body: JSON.stringify({
                context: sanitizedContext,
                browseId,
              }),
              credentials: 'include',
            }
          )
          if (res.ok) {
            const browseData = await res.json()
            const result = findPlaylistsAndContinuation(browseData)
            Object.assign(allPlaylists, result.playlists)
            continuationToken = result.continuation
            if (
              Object.keys(allPlaylists).length > 0 ||
              Boolean(continuationToken)
            ) {
              break
            }
          } else {
            console.warn(
              `TubeZenify [${sourceLabel}]: ${browseId} returned HTTP ${res.status}`
            )
          }
        } catch (e) {
          console.warn(`TubeZenify [${sourceLabel}]: ${browseId} failed`, e)
        }
      }
    }

    // Step 3: Follow Continuations (Pagination)
    let pageCount = 1
    const maxPages = 20

    while (
      continuationToken &&
      pageCount < maxPages &&
      apiKey &&
      sanitizedContext
    ) {
      pageCount++
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`,
        {
          method: 'POST',
          headers: browseHeaders,
          body: JSON.stringify({
            context: sanitizedContext,
            continuation: continuationToken,
          }),
          credentials: 'include',
        }
      )

      if (!res.ok) break
      const batchData = await res.json()
      const result = findPlaylistsAndContinuation(batchData)
      Object.assign(allPlaylists, result.playlists)
      continuationToken = result.continuation
    }

    // Step 4: Augment with Guide Data (sidebar playlists)
    if (apiKey && sanitizedContext) {
      try {
        const guidePlaylists = await fetchSidebarGuidePlaylists(
          apiKey,
          sanitizedContext,
          clientVersion,
          sapisid,
          accountMeta
        )

        Object.values(guidePlaylists).forEach((gPlaylist) => {
          if (allPlaylists[gPlaylist.id]) {
            if (!allPlaylists[gPlaylist.id].icon && gPlaylist.icon) {
              allPlaylists[gPlaylist.id].icon = gPlaylist.icon
            }
          } else {
            allPlaylists[gPlaylist.id] = gPlaylist
          }
        })
      } catch (e) {
        console.warn(
          `TubeZenify [${sourceLabel}]: Guide playlists fetch failed`,
          e
        )
      }
    }

    return allPlaylists
  } catch (e) {
    console.error(
      `TubeZenify [${sourceLabel}]: Error during playlist fetch:`,
      e
    )
    return allPlaylists
  }
}

export { buildSanitizedContext }
