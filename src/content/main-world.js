/**
 * This script runs in the MAIN world of YouTube.
 * It has access to the internal JS variables like 'ytd-guide-renderer'.data.
 */
;(() => {
  const SYSTEM_PLAYLIST_IDS = new Set(['WL', 'LL', 'HL', 'LM'])

  const MAX_SCAN_DEPTH = 40

  function traverseGuideEntries(onEntry) {
    const guide = document.querySelector('ytd-guide-renderer')
    if (!guide || (!guide.data && !guide.__data__)) return
    const data = guide.data || guide.__data__
    const visited = new WeakSet()

    function search(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > MAX_SCAN_DEPTH) return
      if (typeof Node !== 'undefined' && obj instanceof Node) return
      if (visited.has(obj)) return
      visited.add(obj)

      if (obj.guideEntryRenderer) {
        onEntry(obj.guideEntryRenderer)
      }

      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          search(obj[i], depth + 1)
        }
        return
      }

      const keys = Object.keys(obj)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (key !== 'guideEntryRenderer') {
          search(obj[key], depth + 1)
        }
      }
    }

    search(data)
  }

  // Listen for channel requests from the Content Script (Isolated World)
  window.addEventListener('TUBE_ZENIFY_REQUEST_GUIDE_DATA', () => {
    try {
      const results = []
      const seen = new Set()

      traverseGuideEntries((item) => {
        const id =
          item.channelId || item.navigationEndpoint?.browseEndpoint?.browseId
        const title =
          item.formattedTitle?.simpleText ||
          item.title?.simpleText ||
          item.title

        if (!id || !title || seen.has(id)) return

        // STRICT FILTERING (Same as Content Script)
        // 1. ID Format: System items like 'Home' often have short IDs or paths.
        // Real channels start with 'UC' or '@'.
        if (!id.startsWith('UC') && !id.startsWith('@')) return

        const icon = item.thumbnail?.thumbnails?.[0]?.url

        // 2. Icon Validation: System items often have no icon or invalid ones.
        if (!icon || !icon.startsWith('https://')) return

        seen.add(id)

        // LIVE detection
        let isLive = !!item.badges?.liveBroadcasting
        if (!isLive) {
          const badges = item.badges || item.metadataBadgeRenderer
          if (badges) {
            const badgeArray = Array.isArray(badges) ? badges : [badges]
            isLive = badgeArray.some((b) => {
              const r = b.metadataBadgeRenderer || b
              const label = (
                r.label?.simpleText ||
                r.label?.runs?.[0]?.text ||
                r.label ||
                ''
              ).toLowerCase()
              return (
                r.style === 'BADGE_STYLE_TYPE_LIVE_NOW' ||
                label.includes('live') ||
                label.includes('ライブ')
              )
            })
          }
        }

        // NEW CONTENT detection
        const labelMain = item.accessibility?.label || ''
        const labelData = item.accessibility?.accessibilityData?.label || ''
        const fullLabel = (labelMain + ' ' + labelData).toLowerCase()

        const hasNew =
          item.presentationStyle ===
            'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT' ||
          item.presentationConfig?.guideEntryPresentationConfig?.isNewContent ||
          fullLabel.includes('new content') ||
          fullLabel.includes('新しいコンテンツ') ||
          fullLabel.includes('有新内容')

        results.push({
          id,
          name: title,
          icon,
          isLive,
          hasNewContent: hasNew,
        })
      })

      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', { detail: results })
      )
    } catch (_e) {
      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_GUIDE_DATA', { detail: [] })
      )
    }
  })

  function extractText(field) {
    if (!field) return ''
    if (typeof field === 'string') return field
    if (field.simpleText) return field.simpleText
    if (Array.isArray(field.runs)) {
      return field.runs.map((r) => r.text || '').join('')
    }
    if (field.content) return field.content
    return ''
  }

  function normalizePlaylistId(rawId) {
    if (!rawId || typeof rawId !== 'string') return ''
    const trimmed = rawId.startsWith('VL') ? rawId.slice(2) : rawId
    if (!trimmed || SYSTEM_PLAYLIST_IDS.has(trimmed)) return ''
    if (
      trimmed.startsWith('FE') ||
      trimmed.startsWith('UC') ||
      trimmed.startsWith('SP')
    ) {
      return ''
    }
    return trimmed
  }

  function extractListIdFromUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return ''
    try {
      const urlObj = new URL(rawUrl, 'https://www.youtube.com')
      return urlObj.searchParams.get('list') || ''
    } catch (_e) {
      return ''
    }
  }

  // Listen for playlist requests from the Content Script (Isolated World)
  window.addEventListener('TUBE_ZENIFY_REQUEST_PLAYLISTS_DATA', () => {
    try {
      const results = []
      const seen = new Set()

      const addPlaylist = (rawId, name, rawIcon) => {
        const id = normalizePlaylistId(rawId)
        if (!id || !name || seen.has(id)) return
        seen.add(id)
        const icon =
          rawIcon && rawIcon.startsWith('//')
            ? `https:${rawIcon}`
            : rawIcon && rawIcon.startsWith('https://')
              ? rawIcon
              : ''
        results.push({
          id,
          name,
          icon,
          url: `https://www.youtube.com/playlist?list=${id}`,
        })
      }

      traverseGuideEntries((item) => {
        const browseId = item.navigationEndpoint?.browseEndpoint?.browseId || ''
        const navUrl =
          item.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ||
          ''
        const urlListId = navUrl.includes('/playlist')
          ? extractListIdFromUrl(navUrl)
          : ''

        if (!browseId.startsWith('VL') && !urlListId) return

        const title =
          extractText(item.formattedTitle) || extractText(item.title)
        const rawIcon = item.thumbnail?.thumbnails?.[0]?.url || ''
        addPlaylist(
          browseId.startsWith('VL') ? browseId : urlListId,
          title,
          rawIcon
        )
      })

      const pathname = window.location.pathname || ''
      if (
        pathname.startsWith('/feed/playlists') ||
        pathname.startsWith('/feed/library')
      ) {
        const visited = new WeakSet()
        const scan = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > MAX_SCAN_DEPTH) return
          if (typeof Node !== 'undefined' && obj instanceof Node) return
          if (visited.has(obj)) return
          visited.add(obj)

          const renderer =
            obj.gridPlaylistRenderer ||
            obj.playlistRenderer ||
            obj.compactPlaylistRenderer
          if (renderer) {
            const thumbs =
              renderer.thumbnail?.thumbnails ||
              renderer.thumbnailRenderer?.playlistVideoThumbnailRenderer
                ?.thumbnail?.thumbnails ||
              []
            addPlaylist(
              renderer.playlistId,
              extractText(renderer.title),
              thumbs[thumbs.length - 1]?.url || ''
            )
          }

          if (obj.lockupViewModel) {
            const lockup = obj.lockupViewModel
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
              lockup.metadata?.lockupMetadataViewModel?.metadata
                ?.contentMetadataViewModel?.metadataRows ||
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

            const isPlaylist =
              lockup.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' ||
              tapBrowseId.startsWith('VL') ||
              Boolean(tapWatchPlaylistId) ||
              hasListUrl
            if (isPlaylist) {
              const primaryThumb =
                lockup.contentImage?.collectionThumbnailViewModel
                  ?.primaryThumbnail?.thumbnailViewModel ||
                lockup.contentImage?.thumbnailViewModel
              const sources = primaryThumb?.image?.sources || []
              addPlaylist(
                normalizePlaylistId(lockup.contentId) ||
                  normalizePlaylistId(tapWatchPlaylistId) ||
                  normalizePlaylistId(tapBrowseId) ||
                  normalizePlaylistId(urlListId),
                extractText(lockup.metadata?.lockupMetadataViewModel?.title),
                sources[sources.length - 1]?.url || ''
              )
            }
          }

          if (Array.isArray(obj)) {
            obj.forEach((el) => scan(el, depth + 1))
          } else {
            Object.values(obj).forEach((val) => {
              if (val && typeof val === 'object') scan(val, depth + 1)
            })
          }
        }

        if (window.ytInitialData) {
          scan(window.ytInitialData)
        }
        document.querySelectorAll('ytd-browse').forEach((browseEl) => {
          const data = browseEl.data || browseEl.__data
          if (data) scan(data)
        })
      }

      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_PLAYLISTS_DATA', {
          detail: results,
        })
      )
    } catch (_e) {
      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_PLAYLISTS_DATA', { detail: [] })
      )
    }
  })

  // Listen for ytcfg credential requests from Content Script (handles SPA & Brand Accounts)
  window.addEventListener('TUBE_ZENIFY_REQUEST_YTCFG', () => {
    try {
      const getCfg = (key) => {
        if (window.ytcfg?.get) return window.ytcfg.get(key)
        return window.ytcfg?.data_?.[key]
      }
      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_YTCFG', {
          detail: {
            apiKey: getCfg('INNERTUBE_API_KEY') || '',
            context: getCfg('INNERTUBE_CONTEXT') || {},
            clientVersion: getCfg('INNERTUBE_CLIENT_VERSION') || '',
            sessionIndex: getCfg('SESSION_INDEX'),
            delegatedSessionId: getCfg('DELEGATED_SESSION_ID') || '',
            visitorData: getCfg('VISITOR_DATA') || '',
          },
        })
      )
    } catch (_e) {
      window.dispatchEvent(
        new CustomEvent('TUBE_ZENIFY_RESPONSE_YTCFG', { detail: {} })
      )
    }
  })
})()
